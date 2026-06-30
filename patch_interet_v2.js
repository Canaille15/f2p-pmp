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
  const r = mustReplaceOnce(content,
    '{e.statut==="ouverte"&&<div style={{fontSize:13,color:"#94a3b8",marginBottom:8}}>{e.nb_interets>0?(e.nb_interets+" intéressé(s)"):"Aucun intéressé"}</div>}',
    '{e.statut==="ouverte"&&<div style={{fontSize:13,color:"#94a3b8",marginBottom:8}}>{e.nb_interets>0?("Intéressé(s) : "+e.interesses_noms):"Aucun intéressé"}</div>}',
    'affichage des noms des intéressés (au lieu du seul compteur)');
  content = r.str; ok = ok && r.ok;
}

{
  const r = mustReplaceOnce(content,
    '{!estDemandeur&&e.statut==="ouverte"&&<button onClick={()=>interesser(e.id)} style={{border:"1.5px solid #e2e8f0",background:"#f8fafc",color:"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>🤝 Je suis intéressé</button>}',
    '{!estDemandeur&&e.statut==="ouverte"&&<button onClick={()=>interesser(e.id)} style={{border:"1.5px solid "+(e.mon_interet?"#1e293b":"#e2e8f0"),background:e.mon_interet?"#1e293b":"#f8fafc",color:e.mon_interet?"#fff":"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>{e.mon_interet?"✅ Intéressé":"🤝 Je suis intéressé"}</button>}',
    'bouton "Je suis intéressé" reflète maintenant mon état (couleur + libellé)');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
