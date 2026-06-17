const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'api', 'api', 'src', 'controllers', 'profilController.js');
let c = fs.readFileSync(filePath, 'utf8');

const old = `  const { is_reserve, familles_hab, couleurs } = req.body;
  try {
    await pool.query(
      \`INSERT INTO profil_agent (cp_agent, is_reserve, familles_hab, couleurs)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE
         is_reserve   = COALESCE(VALUES(is_reserve),   is_reserve),
         familles_hab = COALESCE(VALUES(familles_hab),  familles_hab),
         couleurs     = COALESCE(VALUES(couleurs),      couleurs)\`,
      [cp,
       is_reserve  !== undefined ? (is_reserve?1:0) : 0,
       familles_hab|| null,
       couleurs    ? JSON.stringify(couleurs) : null]
    );
    res.json({ message: 'Profil mis à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }`;

const newCode = `  const { is_reserve, familles_hab, agent_colors, habilitations, pause_figee, compteur_corrections, fetes_tracking, pause_figee_fia_mois, pause_figee_fia_done, demandes_conges, notifications_acquittees, roulement } = req.body;
  try {
    await pool.query(
      \`INSERT INTO profil_agent (cp_agent, is_reserve, familles_hab, couleurs, roulement)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         is_reserve   = COALESCE(VALUES(is_reserve),   is_reserve),
         familles_hab = COALESCE(VALUES(familles_hab),  familles_hab),
         couleurs     = COALESCE(VALUES(couleurs),      couleurs),
         roulement    = COALESCE(VALUES(roulement),     roulement)\`,
      [cp,
       is_reserve !== undefined ? (is_reserve?1:0) : 0,
       familles_hab || null,
       agent_colors ? JSON.stringify(agent_colors) : null,
       roulement || null]
    );
    res.json({ message: 'Profil mis à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }`;

if(c.includes(old)) {
  c = c.replace(old, newCode);
  console.log('OK - updateProfil corrigé');
} else {
  console.log('ERREUR - updateProfil non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
