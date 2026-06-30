const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

function mustReplaceOnce(str, target, replacement, label) {
  const count = str.split(target).length - 1;
  if (count !== 1) {
    console.error('ATTENTION : "' + label + '" trouvé ' + count + ' fois (attendu 1). Ignoré par sécurité.');
    return { str, ok: false };
  }
  console.log('OK : ' + label);
  return { str: str.split(target).join(replacement), ok: true };
}

let ok = true;

{
  const target = '<span style={{fontSize:11,fontWeight:700,color:"#64748b"}}>📋 Vue Planning</span>';
  const replacement = '<span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>📋 Vue Planning</span>';
  const r = mustReplaceOnce(content, target, replacement, 'libellé "Vue Planning" plus contrasté');
  content = r.str; ok = ok && r.ok;
}

{
  const target = '<span style={{fontSize:9,color:"#94a3b8"}}>— Scroll pour naviguer entre les mois</span>';
  const replacement = '<span style={{fontSize:12,fontWeight:600,color:"#475569"}}>— Scroll pour naviguer entre les mois</span>';
  const r = mustReplaceOnce(content, target, replacement, 'sous-texte légende plus contrasté');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
