// patch_bulletin_22_backend_multiperiodes.js
// Patch backend uniquement : met à jour bulletinImportController.js pour supporter
// les entrées multi-périodes du déroulé prévisionnel (prise de nuit = 2 périodes/jour).
// Exécution : node patch_bulletin_22_backend_multiperiodes.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const ctrlPath = path.join(__dirname, 'api', 'api', 'src', 'controllers', 'bulletinImportController.js');
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

if (ctrl.includes('e.periodes')) {
  console.log('⚠️  bulletinImportController.js supporte déjà les multi-périodes — aucune modification appliquée.');
  process.exit(0);
}

const oldInsert =
`      const codeEquipe = e.code_equipe || null;
      const prive = CODES_PUBLICS.has(codeEquipe) ? 0 : 1;
      await conn.query(
        \`INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
         VALUES (?,1,?,?,?,?,?,?,?)\`,
        [jour.id, codeEquipe, e.code_poste || null, e.heure_debut || null, e.heure_fin || null, prive, null, null]
      );`;

const newInsert =
`      // Support multi-périodes : déroulé prévisionnel envoie e.periodes[], bulletin envoie champs directs
      const periodes = e.periodes || [{
        code_equipe: e.code_equipe || null,
        code_poste: e.code_poste || null,
        heure_debut: e.heure_debut || null,
        heure_fin: e.heure_fin || null,
        ordre: 1,
      }];

      for (const p of periodes) {
        if (!p.code_equipe) continue;
        const prive = CODES_PUBLICS.has(p.code_equipe) ? 0 : 1;
        await conn.query(
          \`INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
           VALUES (?,?,?,?,?,?,?,?,?)\`,
          [jour.id, p.ordre || 1, p.code_equipe, p.code_poste || null, p.heure_debut || null, p.heure_fin || null, prive, null, null]
        );
      }`;

ctrl = mustReplaceOnce(ctrl, oldInsert, newInsert, 'bulletinImportController.js multi-periodes');
fs.writeFileSync(ctrlPath, ctrl, 'utf8');
console.log('✅ bulletinImportController.js mis à jour : support multi-périodes par jour (prise de nuit).');
