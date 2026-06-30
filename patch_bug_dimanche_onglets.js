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

// ── 1. BUG PRINCIPAL : calcul du lundi de la semaine faux le dimanche ────────
{
  const r = mustReplaceOnce(content,
    'd.setDate(d.getDate()-d.getDay()+1+(offset*7)); // lundi',
    'const _dow=d.getDay(); d.setDate(d.getDate()+(_dow===0?-6:1-_dow)+(offset*7)); // lundi (gère le cas dimanche=0)',
    'fix calcul du lundi de la semaine (bug dimanche)');
  content = r.str; ok = ok && r.ok;
}

// ── 2. Ordre des onglets : Mon planning, CPS Officiel, Planning Prévisionnel ─
{
  const r = mustReplaceOnce(content,
    '{k:"personal",l:"📊 Mon planning"},\n    {k:"previsionnel", l:"\\u{1F4C5} Planning Prévisionnel"},\n    {k:"global",  l:"📋 CPS Officiel"},',
    '{k:"personal",l:"📊 Mon planning"},\n    {k:"global",  l:"📋 CPS Officiel"},\n    {k:"previsionnel", l:"\\u{1F4C5} Planning Prévisionnel"},',
    'ordre des 3 onglets (CPS avant Prévisionnel)');
  content = r.str; ok = ok && r.ok;
}

// ── 3. Bandeau d'onglets fixe sur mobile (plus de scroll/décalage) + contraste ─
{
  const r = mustReplaceOnce(content,
    `      <div style={{borderTop:"1px solid #f1f5f9",overflowX:"auto",
        WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        <div style={{display:"flex",minWidth:"max-content",
          padding:"0 12px",gap:2}}>
          {VIEWS.filter(v=>["personal","previsionnel","global"].includes(v.k)).map(({k,l})=>{
            const actif = view===k;
            return(
              <button key={k} onClick={()=>setView(k)}
                style={{
                  border:"none",background:"transparent",
                  padding:"9px 14px",cursor:"pointer",
                  fontSize:12,fontWeight:actif?800:500,
                  color:actif?"#0f4c81":"#94a3b8",
                  borderBottom:actif?"2.5px solid #0f4c81":"2.5px solid transparent",
                  whiteSpace:"nowrap",position:"relative",
                  letterSpacing:actif?-.1:0,`,
    `      <div style={{borderTop:"1px solid #f1f5f9",overflowX:"hidden"}}>
        <div style={{display:"flex",width:"100%",
          padding:"0 6px",gap:2}}>
          {VIEWS.filter(v=>["personal","previsionnel","global"].includes(v.k)).map(({k,l})=>{
            const actif = view===k;
            return(
              <button key={k} onClick={()=>setView(k)}
                style={{
                  border:"none",background:"transparent",
                  padding:"9px 6px",cursor:"pointer",flex:1,minWidth:0,
                  fontSize:11,fontWeight:actif?800:600,
                  color:actif?"#0a3a63":"#334155",
                  borderBottom:actif?"2.5px solid #0a3a63":"2.5px solid transparent",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",position:"relative",
                  letterSpacing:actif?-.1:0,`,
    'bandeau d\'onglets fixe sur mobile + contraste renforcé');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
