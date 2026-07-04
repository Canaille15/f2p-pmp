// Patch 2/5 — Annuaire : ajoute le champ auto-éditable annuaire_visible
// dans agentController.update() (même pattern que partage_previsionnel)
// Usage : node patch_annuaire_2_agentcontroller_visible.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp\api\api

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'controllers', 'agentController.js');
const NL = '\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = [
  `  const { email, telephone, grade, nom, prenom, poste, partage_previsionnel, famille, nouveau_cp, is_admin } = req.body;`,
  `  const fields = [], values = [];`,
  `  if (email !== undefined)     { fields.push('email = ?');     values.push(encrypt(email)); }`,
  `  if (telephone !== undefined) { fields.push('telephone = ?'); values.push(encrypt(telephone)); }`,
  `  if (partage_previsionnel !== undefined) { fields.push('partage_previsionnel = ?'); values.push(partage_previsionnel ? 1 : 0); }`,
].join(NL);

const new1 = [
  `  const { email, telephone, grade, nom, prenom, poste, partage_previsionnel, annuaire_visible, famille, nouveau_cp, is_admin } = req.body;`,
  `  const fields = [], values = [];`,
  `  if (email !== undefined)     { fields.push('email = ?');     values.push(encrypt(email)); }`,
  `  if (telephone !== undefined) { fields.push('telephone = ?'); values.push(encrypt(telephone)); }`,
  `  if (partage_previsionnel !== undefined) { fields.push('partage_previsionnel = ?'); values.push(partage_previsionnel ? 1 : 0); }`,
  `  if (annuaire_visible !== undefined) { fields.push('annuaire_visible = ?'); values.push(annuaire_visible ? 1 : 0); }`,
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'annuaire-visible-field');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — agentController.js patché (champ annuaire_visible auto-éditable)');
