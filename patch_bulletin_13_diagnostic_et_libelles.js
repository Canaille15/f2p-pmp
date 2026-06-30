// patch_bulletin_13_diagnostic_et_libelles.js
// 1) Ajoute un diagnostic : compare la période "Commande allant du... au..." du bulletin
//    à ce qui a réellement été détecté, pour lister précisément les jours invisibles
//    (pas juste les jours détectés-mais-en-échec).
// 2) Ajoute un helper getPosteLabelFromCode() qui retrouve le libellé du poste (CCL, AC PAR...)
//    à partir du code jsCode, et l'affiche dans le message de résultat de l'import.
// Exécution : node patch_bulletin_13_diagnostic_et_libelles.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// ── 1. Ajout du helper getPosteLabelFromCode, juste avant parseBulletinCommande ──
const anchorHelper = `// Parse un bulletin de commande SNCF (texte déjà extrait, PDF natif ou OCR) :`;

const helperBlock = `// Retrouve le libellé lisible d'un poste (ex: "CCL", "AC PAR") à partir de son code jsCode (ex: "PICCL-")
function getPosteLabelFromCode(jsCode) {
  if (!jsCode) return null;
  const tousPostes3x8 = [...POSTES_PRCI_3x8, ...POSTES_PAR_3x8];
  const p3x8 = tousPostes3x8.find(p => p.M === jsCode || p.AM === jsCode || p.N === jsCode);
  if (p3x8) return p3x8.label;
  const pj = POSTES_JOURNEE.find(p => p.jsCode === jsCode);
  if (pj) return pj.label;
  return null;
}

`;

if (content.includes('function getPosteLabelFromCode')) {
  console.log('⚠️  getPosteLabelFromCode existe déjà — étape 1 ignorée.');
} else {
  content = mustReplaceOnce(content, anchorHelper, helperBlock + anchorHelper, 'App.jsx ajout getPosteLabelFromCode');
}

// ── 2. Diagnostic des jours manquants (comparaison à la période complète du bulletin) ──
const oldReturn = `  return { editionDate, jours, echecs };
}

function BulletinImportButton`;

if (content.includes('jour_non_detecte')) {
  console.log('⚠️  Diagnostic jours manquants déjà présent — étape 2 ignorée.');
} else {
  const newReturn = `  // Diagnostic : comparer à la période complète "Commande allant du... au..." pour
  // repérer les jours qui n'ont même pas été détectés comme bloc (pas juste en échec de code)
  const periodeMatch = text.match(/Commande allant du\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s*au\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/i);
  if (periodeMatch) {
    const debut = new Date(\`\${periodeMatch[3]}-\${periodeMatch[2]}-\${periodeMatch[1]}T12:00:00\`);
    const fin = new Date(\`\${periodeMatch[6]}-\${periodeMatch[5]}-\${periodeMatch[4]}T12:00:00\`);
    const datesDetectees = new Set(jours.map(j => j.date_jour));
    const datesEnEchec = new Set(echecs.filter(e => e.date).map(e => e.date));
    for (let d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
      const dk = \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, "0")}-\${String(d.getDate()).padStart(2, "0")}\`;
      if (!datesDetectees.has(dk) && !datesEnEchec.has(dk)) {
        echecs.push({ date: dk, motif: "jour_non_detecte" });
      }
    }
  }

  return { editionDate, jours, echecs };
}

function BulletinImportButton`;

  content = mustReplaceOnce(content, oldReturn, newReturn, 'App.jsx diagnostic jours manquants');
}

// ── 3. Affichage des libellés de poste + détail des échecs dans le message de résultat ──
const oldResultLine = `      {result?.nb !== undefined && !result.error && <span style={{ fontSize: 10, background: "#f0fdf4", color: "#16a34a", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>
        ✅ {result.nb} jour(s) importé(s){result.ignores?.length ? \` · \${result.ignores.length} ignoré(s) (déjà à jour)\` : ""}{result.echecs?.length ? \` · \${result.echecs.length} jour(s) à vérifier manuellement\` : ""}
      </span>}`;

if (content.includes('result.postesLabels')) {
  console.log('⚠️  Affichage des libellés déjà présent — étape 3 ignorée.');
} else {
  if (!content.includes(oldResultLine)) {
    throw new Error("Bloc d'affichage du résultat introuvable tel quel — vérifie si une modification manuelle a eu lieu.");
  }
  const newResultLine = `      {result?.nb !== undefined && !result.error && <span style={{ fontSize: 10, background: "#f0fdf4", color: "#16a34a", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>
        ✅ {result.nb} jour(s) importé(s){result.ignores?.length ? \` · \${result.ignores.length} ignoré(s) (déjà à jour)\` : ""}{result.echecs?.length ? \` · \${result.echecs.length} jour(s) à vérifier manuellement (\${[...new Set(result.echecs.map(e=>e.date).filter(Boolean))].join(", ")})\` : ""}{result.postesLabels?.length ? \` · Postes : \${result.postesLabels.join(", ")}\` : ""}
      </span>}`;
  content = mustReplaceOnce(content, oldResultLine, newResultLine, 'App.jsx affichage libellés + détail échecs');
}

// ── 4. Calcul de postesLabels au moment de fixer le résultat de l'import ──
const oldSetResult = `        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");
        setResult({ nb: resp?.nb_appliques || 0, ignores: resp?.ignores || [], echecs });`;

if (content.includes('postesLabels:')) {
  console.log('⚠️  Calcul postesLabels déjà présent — étape 4 ignorée.');
} else {
  if (!content.includes(oldSetResult)) {
    throw new Error("Bloc setResult introuvable tel quel — vérifie si une modification manuelle a eu lieu.");
  }
  const newSetResult = `        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");
        const postesLabels = [...new Set(entries.map(e => getPosteLabelFromCode(e.code_poste)).filter(Boolean))];
        setResult({ nb: resp?.nb_appliques || 0, ignores: resp?.ignores || [], echecs, postesLabels });`;
  content = mustReplaceOnce(content, oldSetResult, newSetResult, 'App.jsx calcul postesLabels');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : diagnostic des jours manquants + libellés de poste dans le résultat d\u2019import.');
