// Patch 17 — Annuaire : (1) ré-ajoute l'icône SMS sur l'onglet Agents
// (perdue par erreur lors du patch 15) ; (2) corrige le bandeau jaune de
// note qui pouvait rester visible même après effacement (vérification
// stricte sur texte non-vide/non-espaces) ; (3) ajoute un bouton "Effacer
// la note" dans le formulaire UO pour vider le champ en un clic.
// Usage : node patch_annuaire_17_appjsx_sms_note_fix.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_16_appjsx_onglet_persistant.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'App.jsx');
const NL = '\r\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

// ── 1. Ré-ajout du bouton SMS dans l'onglet Agents (uniquement là) ──
const old1 = [
  '                {a.telephone&&<a href={`tel:${a.telephone}`} style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none",padding:"7px 12px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca"}}>',
  '                  <IconTel size={15}/>',
  '                  <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{a.telephone}</span>',
  '                </a>}',
].join(NL);

const new1 = [
  '                {a.telephone&&<a href={`tel:${a.telephone}`} style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none",padding:"7px 12px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca"}}>',
  '                  <IconTel size={15}/>',
  '                  <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{a.telephone}</span>',
  '                </a>}',
  '                {a.telephone&&<a href={`sms:${a.telephone}`} title="SMS" style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,textDecoration:"none",borderRadius:8,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:16}}>💬</a>}',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'agents-sms-reajout');

// ── 2. Note UO : vérification stricte (texte réellement non-vide) ──
const old2 = '                {u.note&&<div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"#fffbeb",borderLeft:"4px solid #f59e0b"}}>';
const new2 = '                {u.note&&u.note.trim()&&<div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"#fffbeb",borderLeft:"4px solid #f59e0b"}}>';
content = mustReplaceOnce(content, old2, new2, 'uo-note-verification-stricte');

// ── 3. UoForm : bouton "Effacer la note" ──
const old3 = [
  '    <div>',
  '      <label style={labelStyle}>Note libre (optionnel)</label>',
  '      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{...champStyle,resize:"vertical",fontFamily:"inherit"}}/>',
  '    </div>',
].join(NL);

const new3 = [
  '    <div>',
  '      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>',
  '        <label style={{...labelStyle,marginBottom:0}}>Note libre (optionnel)</label>',
  '        {note&&<button type="button" onClick={()=>setNote("")} style={{border:"none",background:"none",color:"#991b1b",fontSize:11,fontWeight:700,cursor:"pointer",padding:0}}>Effacer la note</button>}',
  '      </div>',
  '      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{...champStyle,resize:"vertical",fontFamily:"inherit"}}/>',
  '    </div>',
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'uoform-bouton-effacer-note');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (SMS Agents ré-ajouté, note UO corrigée + bouton effacer)');
