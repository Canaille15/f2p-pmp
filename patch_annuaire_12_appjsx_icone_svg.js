// Patch 12 — Annuaire : remplace le caractère texte ☎ (jugé moins beau que
// l'émoji d'origine) par une icône SVG "combiné téléphonique" — même silhouette
// reconnaissable que l'émoji 📞, mais vectorielle donc réellement colorable en
// rouge (contrairement à un émoji couleur natif, qui ignore le CSS color).
// Usage : node patch_annuaire_12_appjsx_icone_svg.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_11_appjsx_menu_acces_rapide.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'App.jsx');
const NL = '\r\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = '    {k:"annuaire",l:(<><span style={{color:"#D22B2B"}}>☎</span> Annuaire</>)},';
const new1 = [
  '    {k:"annuaire",l:(<><svg width="15" height="15" viewBox="0 0 24 24" fill="#D22B2B" style={{verticalAlign:"-2px",marginRight:2}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg> Annuaire</>)},',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'menu-icone-svg-telephone');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (icône téléphone SVG rouge dans le menu Annuaire)');
