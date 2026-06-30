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

// 1. Vue Mois : en-têtes Lun/Mar/... responsives
{
  const target = '<div key={d} style={{padding:"6px 4px",textAlign:"center",fontSize:9,fontWeight:800,color:"#94a3b8",letterSpacing:.3}}>{d}</div>';
  const replacement = '<div key={d} style={{padding:"6px 4px",textAlign:"center",fontSize:"clamp(9px,1.2vw,13px)",fontWeight:800,color:"#475569",letterSpacing:.3}}>{d}</div>';
  const r = mustReplaceOnce(content, target, replacement, 'vue Mois : en-têtes des jours responsives');
  content = r.str; ok = ok && r.ok;
}

// 2. Vue Mois : numéro du jour responsive (remplace la taille fixe posée juste avant)
{
  const target = [
    '<div style={{fontSize:15,fontWeight:isToday?800:700,',
    '                color:isToday?"#6366f1":isWE?"#b45309":"#1e293b",',
    '                lineHeight:1.3, marginBottom:1}}>{dayNum}</div>',
  ].join('\r\n');
  const replacement = [
    '<div style={{fontSize:"clamp(13px,2.4vw,24px)",fontWeight:isToday?800:700,',
    '                color:isToday?"#6366f1":isWE?"#b45309":"#1e293b",',
    '                lineHeight:1.3, marginBottom:1}}>{dayNum}</div>',
  ].join('\r\n');
  const r = mustReplaceOnce(content, target, replacement, 'vue Mois : numéro du jour responsive');
  content = r.str; ok = ok && r.ok;
}

// 3. Vue Semaine : nom du jour + date responsives
{
  const target = [
    '<div style={{fontSize:13,fontWeight:isToday?800:700,',
    '                color:isToday?"#6366f1":isWE?"#b45309":"#1e293b"}}>',
    '                {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][i]}',
    '              </div>',
    '              <div style={{fontSize:12,fontWeight:700,color:isToday?"#6366f1":"#334155",marginTop:1}}>',
    '                {dk?.slice(8)}/{dk?.slice(5,7)}',
    '              </div>',
  ].join('\r\n');
  const replacement = [
    '<div style={{fontSize:"clamp(11px,1.8vw,18px)",fontWeight:isToday?800:700,',
    '                color:isToday?"#6366f1":isWE?"#b45309":"#1e293b"}}>',
    '                {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][i]}',
    '              </div>',
    '              <div style={{fontSize:"clamp(11px,1.8vw,18px)",fontWeight:700,color:isToday?"#6366f1":"#334155",marginTop:1}}>',
    '                {dk?.slice(8)}/{dk?.slice(5,7)}',
    '              </div>',
  ].join('\r\n');
  const r = mustReplaceOnce(content, target, replacement, 'vue Semaine : nom du jour + date responsives');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
