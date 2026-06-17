const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Ajouter onDayClick dans l'appel de VuePlanning
const oldCall = `<VuePlanning\r\n        dates={monthDates}\r\n        agent={agent}\r\n        schedule={schedule}\r\n        getColor={getColor}\r\n        getTc={getTc}\r\n        isOwnProfile={isOwnProfile}\r\n      />`;

const newCall = `<VuePlanning\r\n        dates={monthDates}\r\n        agent={agent}\r\n        schedule={schedule}\r\n        getColor={getColor}\r\n        getTc={getTc}\r\n        isOwnProfile={isOwnProfile}\r\n        onDayClick={(dk,en)=>setDayPopup({dk,entry:en||null})}\r\n      />`;

if(c.includes(oldCall)) {
  c = c.replace(oldCall, newCall);
  console.log('OK - prop onDayClick ajoutée');
} else {
  console.log('ERREUR - appel VuePlanning non trouvé');
}

// 2. Ajouter onDayClick dans la signature de VuePlanning
const oldSig = `VuePlanning({dates, agent, schedule, getColor, getTc, isOwnProfile}){`;
const newSig = `VuePlanning({dates, agent, schedule, getColor, getTc, isOwnProfile, onDayClick}){`;

if(c.includes(oldSig)) {
  c = c.replace(oldSig, newSig);
  console.log('OK - signature VuePlanning mise à jour');
} else {
  console.log('ERREUR - signature non trouvée');
}

// 3. Ajouter onClick sur la ligne jour dans VuePlanning
const oldLigne = `              <div style={{\r\n                display:"flex",alignItems:"stretch",\r\n                minHeight:52,\r\n                background:l.isToday?"#eef2ff":l.isWE?"#fafafa":"#fff",\r\n                borderBottom:"1px solid #f8fafc",\r\n                borderLeft:l.isToday?"3px solid #6366f1":"3px solid transparent",\r\n              }}>`;

const newLigne = `              <div onClick={()=>onDayClick&&onDayClick(l.dk, schedule[\`\${agent.id}-\${l.dk}\`]||null)} style={{\r\n                display:"flex",alignItems:"stretch",\r\n                minHeight:52,\r\n                background:l.isToday?"#eef2ff":l.isWE?"#fafafa":"#fff",\r\n                borderBottom:"1px solid #f8fafc",\r\n                borderLeft:l.isToday?"3px solid #6366f1":"3px solid transparent",\r\n                cursor:"pointer",\r\n              }}>`;

if(c.includes(oldLigne)) {
  c = c.replace(oldLigne, newLigne);
  console.log('OK - onClick ajouté sur ligne jour');
} else {
  console.log('ERREUR - ligne jour non trouvée');
}

// 4. Ajouter le poste sous le badge dans VuePlanning
const oldBadge = `                        {CODES_FETES[l.code]?"\u{1F339}":""}{l.label}\r\n                        </span>`;
const newBadge = `                        {CODES_FETES[l.code]?"\u{1F339}":""}{l.label}\r\n                        </span>\r\n                        {schedule[\`\${agent.id}-\${l.dk}\`]?.jsCode&&!["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(schedule[\`\${agent.id}-\${l.dk}\`]?.jsCode)&&<span style={{fontSize:10,color:l.tc,opacity:.8,marginLeft:6,fontWeight:500}}>{schedule[\`\${agent.id}-\${l.dk}\`]?.jsCode}</span>}`;

if(c.includes(oldBadge)) {
  c = c.replace(oldBadge, newBadge);
  console.log('OK - poste ajouté sous badge');
} else {
  console.log('ERREUR - badge non trouvé');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
