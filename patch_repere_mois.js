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

const target = [
  '            <div key={l.dk}>',
  '              {/* Séparateur semaine si lundi */}',
].join('\r\n');

const replacement = [
  '            <div key={l.dk}>',
  '              {isFirstOfMonth&&<div style={{position:"sticky",top:0,zIndex:5,background:"#1e293b",padding:"9px 14px",fontSize:14,fontWeight:800,color:"#fff",letterSpacing:.3,textTransform:"capitalize"}}>{new Date(l.dk+"T12:00:00").toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</div>}',
  '              {/* Séparateur semaine si lundi */}',
].join('\r\n');

const r = mustReplaceOnce(content, target, replacement, 'repère du mois courant (sticky) ajouté dans la vue Planning');
content = r.str; ok = ok && r.ok;

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
