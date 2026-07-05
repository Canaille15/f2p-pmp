// Patch 11b — protège agentController.getOne contre une donnée illisible
// (ex: chiffrée avec une clé antérieure à la rotation de sécurité du
// 04/07/2026) : au lieu de faire planter toute la requête (500, boucle
// d'erreur infinie dans Mon profil), la valeur illisible devient simplement
// null ("non communiqué") pour ce seul champ.
// Usage : node patch_annuaire_11b_agentcontroller_getone_safe.js
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
  `    const a = rows[0];`,
  `    if (a.email)     a.email     = decrypt(a.email);`,
  `    if (a.telephone) a.telephone = decrypt(a.telephone);`,
].join(NL);

const new1 = [
  `    const a = rows[0];`,
  `    // Déchiffrement protégé : une valeur illisible (ex: chiffrée avec une`,
  `    // clé antérieure à une rotation de sécurité) ne doit jamais faire`,
  `    // planter la requête entière — elle devient simplement null.`,
  `    const decryptSafe = (v) => { try { return v ? decrypt(v) : v; } catch (e) { console.error('Déchiffrement impossible (donnée conservée illisible) :', e.message); return null; } };`,
  `    a.email     = decryptSafe(a.email);`,
  `    a.telephone = decryptSafe(a.telephone);`,
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'getone-decrypt-safe');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — agentController.js patché (getOne : déchiffrement protégé)');
