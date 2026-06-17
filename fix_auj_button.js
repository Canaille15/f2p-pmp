const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Style du bouton Auj. toujours visible
const btnAujStyle = `border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0`;

// Vue Mois - remplacer le bouton conditionnel par toujours visible
const oldMois = `{monthOff!==0&&<button onClick={()=>setMonthOff(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}`;
const newMois = `<button onClick={()=>setMonthOff(0)} style={{${btnAujStyle},opacity:monthOff===0?0.4:1}}>Auj.</button>`;

let count = 0;
if(c.includes(oldMois)) {
  c = c.replace(oldMois, newMois);
  count++;
  console.log('OK - Vue Mois');
} else {
  console.log('ERREUR - Vue Mois non trouvé');
}

// Vue Semaine
const oldSemaine = `{weekOffset!==0&&<button onClick={()=>setWeekOffset(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>}`;
const newSemaine = `<button onClick={()=>setWeekOffset(0)} style={{${btnAujStyle},opacity:weekOffset===0?0.4:1}}>Auj.</button>`;

if(c.includes(oldSemaine)) {
  c = c.replace(oldSemaine, newSemaine);
  count++;
  console.log('OK - Vue Semaine');
} else {
  console.log('ERREUR - Vue Semaine non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log(`Terminé - ${count} remplacements`);
