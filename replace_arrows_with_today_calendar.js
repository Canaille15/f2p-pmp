const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('const jumpToDate=')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : ajouter jumpToDate juste apres goToToday
const idxGoToToday = content.indexOf('const goToToday=()=>{');
if (idxGoToToday === -1) { console.log('ERREUR: goToToday introuvable'); process.exit(1); }
const idxGoToTodayEnd = content.indexOf('};', idxGoToToday) + 2;
const jumpToDateFn = `
  const jumpToDate=(dateStr)=>{
    const target=new Date(dateStr+"T12:00:00");
    const targetDow=target.getDay();
    const targetMondayOffset=targetDow===0?-6:1-targetDow;
    const targetMonday=new Date(target); targetMonday.setDate(target.getDate()+targetMondayOffset); targetMonday.setHours(12,0,0,0);
    const today=new Date();
    const todayDow=today.getDay();
    const todayMondayOffset=todayDow===0?-6:1-todayDow;
    const currentMonday=new Date(today); currentMonday.setDate(today.getDate()+todayMondayOffset); currentMonday.setHours(12,0,0,0);
    const diffWeeks=Math.round((targetMonday-currentMonday)/(7*24*60*60*1000));
    setWeekOffset(diffWeeks);
    setDayIdx(targetDow===0?6:targetDow-1);
  };`;
content = content.slice(0, idxGoToTodayEnd) + jumpToDateFn + content.slice(idxGoToTodayEnd);
console.log('Etape 1 OK - jumpToDate ajoute');

// ETAPE 2 : remplacer les 3 boutons (precedent/Auj./suivant) par Aujourd'hui + icone calendrier
const idxStart = content.indexOf('<button onClick={()=>goToDay(-1)}');
if (idxStart === -1) { console.log('ERREUR: bouton precedent introuvable'); process.exit(1); }
const idxNextBtn = content.indexOf('<button onClick={()=>goToDay(1)}');
if (idxNextBtn === -1) { console.log('ERREUR: bouton suivant introuvable'); process.exit(1); }
const idxEnd = content.indexOf('</button>', idxNextBtn) + '</button>'.length;

const calIcon = '\uD83D\uDCC5';
const calIcon2 = '\uD83D\uDCC6';
const apostrophe = String.fromCharCode(39);

const newNav = '<button onClick={goToToday} style={{display:"flex",alignItems:"center",gap:6,border:"1.5px solid #378ADD",background:weekOffset===0?"#f1f5f9":"#E6F1FB",color:weekOffset===0?"#94a3b8":"#0C447C",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>' + calIcon + ' Aujourd' + apostrophe + 'hui</button>\n        <label style={{position:"relative",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,border:"1.5px solid #e2e8f0",borderRadius:8,background:"#fff",flexShrink:0,fontSize:15}}>\n          ' + calIcon2 + '\n          <input type="date" onChange={e=>{if(e.target.value)jumpToDate(e.target.value);}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>\n        </label>';

content = content.slice(0, idxStart) + newNav + content.slice(idxEnd);
console.log('Etape 2 OK - fleches remplacees par Aujourd' + apostrophe + 'hui + icone calendrier');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
