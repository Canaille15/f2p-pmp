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

// 1. Ajout d'un helper "3 mois voisins" + utilisation à l'état initial
{
  const target = '  const moisCourant = ()=>{ const d=new Date(); return {year:d.getFullYear(), month:d.getMonth()+1}; };\r\n  const [monthsRange, setMonthsRange] = useState(()=>[moisCourant()]);';
  const replacement = [
    '  const moisCourant = ()=>{ const d=new Date(); return {year:d.getFullYear(), month:d.getMonth()+1}; };',
    '  const moisVoisins = ()=>{',
    '    const c=moisCourant();',
    '    let py=c.year, pm=c.month-1; if(pm<1){pm=12;py--;}',
    '    let ny=c.year, nm=c.month+1; if(nm>12){nm=1;ny++;}',
    '    return [{year:py,month:pm},c,{year:ny,month:nm}];',
    '  };',
    '  const [monthsRange, setMonthsRange] = useState(()=>moisVoisins());',
  ].join('\r\n');
  const r = mustReplaceOnce(content, target, replacement, 'helper "3 mois voisins" + état initial sur 3 mois');
  content = r.str; ok = ok && r.ok;
}

// 2. Le bouton "Aujourd'hui" réinitialise aussi sur 3 mois (pas un seul)
{
  const target = '      setMonthsRange([moisCourant()]);';
  const replacement = '      setMonthsRange(moisVoisins());';
  const r = mustReplaceOnce(content, target, replacement, 'bouton Aujourd\'hui réinitialise sur 3 mois');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
