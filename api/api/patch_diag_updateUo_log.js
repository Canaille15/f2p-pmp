// Patch de diagnostic TEMPORAIRE — ajoute un log détaillé dans updateUo
// pour voir exactement ce que le serveur reçoit et fait avec le champ note.
// À supprimer une fois le bug identifié (voir patch_diag_updateUo_retrait.js
// fourni séparément si besoin, ou reviens à la version normale).
// Usage : node patch_diag_updateUo_log.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp\api\api

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'controllers', 'annuaireController.js');
const NL = '\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = [
  `async function updateUo(req, res) {`,
  `  const { id } = req.params;`,
  `  const { fonction, titulaire_nom, titulaire_prenom, mobile_perso, mobile_pro, fixe, email, note } = req.body;`,
].join(NL);

const new1 = [
  `async function updateUo(req, res) {`,
  `  const { id } = req.params;`,
  `  const { fonction, titulaire_nom, titulaire_prenom, mobile_perso, mobile_pro, fixe, email, note } = req.body;`,
  `  console.log('=== DIAG updateUo === id reçu:', id, '| note reçue:', JSON.stringify(note));`,
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'diag-log-entree');

const old2 = [
  `    const [result] = await pool.query(`,
  `      \`UPDATE annuaire_uo SET \${fields.join(', ')}, modifie_le = NOW() WHERE id = ?\`,`,
  `      values`,
  `    );`,
  `    if (result.affectedRows === 0) return res.status(404).json({ error: 'Fiche introuvable' });`,
  `    res.json({ message: 'Fiche mise à jour' });`,
].join(NL);

const new2 = [
  `    const sql = \`UPDATE annuaire_uo SET \${fields.join(', ')}, modifie_le = NOW() WHERE id = ?\`;`,
  `    console.log('=== DIAG updateUo === SQL:', sql, '| values:', JSON.stringify(values));`,
  `    const [result] = await pool.query(sql, values);`,
  `    console.log('=== DIAG updateUo === affectedRows:', result.affectedRows, 'changedRows:', result.changedRows);`,
  `    if (result.affectedRows === 0) return res.status(404).json({ error: 'Fiche introuvable' });`,
  `    res.json({ message: 'Fiche mise à jour' });`,
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'diag-log-sql');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — annuaireController.js patché avec logs de diagnostic (temporaire)');
