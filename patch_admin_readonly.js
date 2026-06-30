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

// 1. Vue Semaine
{
  const target = '          return <div key={dk}\r\n            onClick={()=>{\r\n              setDayPopup({dk, entry:en||null});\r\n            }}\r\n            style={{';
  const replacement = '          return <div key={dk}\r\n            onClick={()=>{\r\n              if(isOwnProfile) setDayPopup({dk, entry:en||null});\r\n            }}\r\n            style={{';
  const r = mustReplaceOnce(content, target, replacement, 'vue Semaine : édition réservée au propriétaire du planning');
  content = r.str; ok = ok && r.ok;
}

// 2. Vue Mois
{
  const target = '            return <div key={dk}\r\n              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}\r\n              style={{';
  const replacement = '            return <div key={dk}\r\n              onClick={()=>{ if(isOwnProfile) setDayPopup({dk, entry:en||null}); }}\r\n              style={{';
  const r = mustReplaceOnce(content, target, replacement, 'vue Mois : édition réservée au propriétaire du planning');
  content = r.str; ok = ok && r.ok;
}

// 3. Vue Planning
{
  const target = 'onDayClick={(dk,en)=>setDayPopup({dk,entry:en||null})}';
  const replacement = 'onDayClick={(dk,en)=>{ if(isOwnProfile) setDayPopup({dk,entry:en||null}); }}';
  const r = mustReplaceOnce(content, target, replacement, 'vue Planning : édition réservée au propriétaire du planning');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
