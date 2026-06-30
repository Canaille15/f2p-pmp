// patch_bulletin_05_layout_fix.js
// Corrige l'affichage du bouton "Importer un bulletin" qui s'étire sur toute la largeur
// (il hérite d'un parent en colonne flex qui étire ses enfants par défaut).
// Exécution : node patch_bulletin_05_layout_fix.js (depuis la racine du projet)

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

const anchor = `function BulletinImportButton({ agentCp, onImported }) {`;
if (!content.includes(anchor)) {
  throw new Error("BulletinImportButton introuvable dans App.jsx — as-tu bien lancé patch_bulletin_04_appjsx.js avant ?");
}

const oldWrapper = `  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ cursor: "pointer" }}>`;

if (!content.includes(oldWrapper)) {
  console.log("⚠️  Le bloc attendu n'a pas été trouvé tel quel — vérifie si le fichier a déjà été corrigé manuellement.");
  process.exit(0);
}

const newWrapper = `  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignSelf: "flex-start", width: "fit-content" }}>
      <label style={{ cursor: "pointer", alignSelf: "flex-start" }}>`;

content = mustReplaceOnce(content, oldWrapper, newWrapper, 'App.jsx layout fix BulletinImportButton');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx corrigé : le bouton "Importer un bulletin" ne s\'étire plus sur toute la largeur.');
