const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Boutons des jours (Lu Ma Me...) - ameliorer contraste texte non-selectionne
const oldDayButton = `<button key={d} onClick={()=>setDayIdx(i)} style={{border:isToday?"2px solid #3b82f6":"none",borderRadius:10,padding:"5px 10px",cursor:"pointer",background:dayIdx===i?"#1e293b":isToday?"#eff6ff":"#f1f5f9",color:dayIdx===i?"#fff":isToday?"#1e40af":"#64748b",fontSize:11,fontWeight:dayIdx===i||isToday?700:400,lineHeight:1.4}}>
            {d}<br/><span style={{opacity:.7,fontSize:10}}>{weekDates[i]?.slice(8)}/{weekDates[i]?.slice(5,7)}</span>
          </button>`;

const newDayButton = `<button key={d} onClick={()=>setDayIdx(i)} style={{border:isToday?"2px solid #378ADD":"1.5px solid #cbd5e1",borderRadius:10,padding:"5px 10px",cursor:"pointer",background:dayIdx===i?"#0C447C":isToday?"#E6F1FB":"#fff",color:dayIdx===i?"#fff":isToday?"#0C447C":"#334155",fontSize:11,fontWeight:dayIdx===i||isToday?700:600,lineHeight:1.4}}>
            {d}<br/><span style={{opacity:.85,fontSize:10}}>{weekDates[i]?.slice(8)}/{weekDates[i]?.slice(5,7)}</span>
          </button>`;

if (c.includes(oldDayButton)) {
  c = c.replace(oldDayButton, newDayButton);
  console.log('OK 1 - boutons jours contraste ameliore');
} else {
  console.log('ERREUR 1 - boutons jours non trouve');
}

// 2. Bouton Auj. - eviter opacite trop faible quand actif
const oldAuj = `<button onClick={()=>setWeekOffset(0)} style={{border:"1.5px solid #6366f1",background:"#eef2ff",color:"#4f46e5",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700,opacity:weekOffset===0?0.4:1}}>Auj.</button>`;

const newAuj = `<button onClick={()=>setWeekOffset(0)} style={{border:"1.5px solid #378ADD",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#94a3b8":"#0C447C",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:700}}>Auj.</button>`;

if (c.includes(oldAuj)) {
  c = c.replace(oldAuj, newAuj);
  console.log('OK 2 - bouton Auj contraste ameliore');
} else {
  console.log('ERREUR 2 - bouton Auj non trouve');
}

fs.writeFileSync('src/App.jsx', c, 'utf8');
