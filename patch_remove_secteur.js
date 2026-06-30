const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = 'function EchangesView';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) { console.error('Marqueur de début introuvable.'); process.exit(1); }
const endMarker = 'function ProfilPersoView';
const endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.error('Marqueur de fin introuvable.'); process.exit(1); }

let block = content.slice(startIdx, endIdx);

function removeOnce(str, target, label) {
  const count = str.split(target).length - 1;
  if (count !== 1) {
    console.error('ATTENTION : "' + label + '" trouvé ' + count + ' fois (attendu 1). Ignoré par sécurité.');
    return str;
  }
  console.log('Retiré : ' + label);
  return str.split(target).join('');
}

block = removeOnce(block, '  const SECTEURS=[["PRCI","PRCI"],["PAR","PAR"],["indifferent","Indifférent"]];\n', 'déclaration SECTEURS');
block = removeOnce(block, 'secteurs:[],', 'secteurs dans état initial du formulaire');
block = block.split('secteurs_souhaites:form.secteurs,').join('');
console.log('Retiré : secteurs_souhaites dans les appels API (create/update)');
block = removeOnce(block, 'secteurs:(e.secteurs_souhaites||"").split(",").filter(Boolean),', 'secteurs dans ouvrirEdition');
block = removeOnce(block, 'const secteurs=(e.secteurs_souhaites||"").split(",").filter(Boolean);\n', 'variable secteurs dans la carte');
block = removeOnce(block, 'const secteurTxt=secteurs.length?(" ("+secteurs.join(", ")+")"):"";\n', 'variable secteurTxt');
block = removeOnce(block, '{secteurTxt}', 'affichage secteurTxt dans la carte');

const blocSecteurField = `
      <div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:6}}>Secteur recherché</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {SECTEURS.map(c=>{const v=c[0],l=c[1];const actif=form.secteurs.includes(v);return(<button key={v} onClick={()=>setForm(p=>({...p,secteurs:toggleVal(p.secteurs,v)}))} style={{border:"1.5px solid "+(actif?"#1e293b":"#e2e8f0"),background:actif?"#1e293b":"#fff",color:actif?"#fff":"#475569",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:14,fontWeight:600}}>{l}</button>);})}
        </div>
      </div>
`;
block = removeOnce(block, blocSecteurField, 'bloc formulaire Secteur recherché');

content = content.slice(0, startIdx) + block + content.slice(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log('App.jsx mis à jour avec succès.');
