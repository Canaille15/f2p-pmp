// Patch 14 — Annuaire : (1) le bouton pour déplier une fiche UO devient
// un vrai bouton visible avec libellé texte ("Voir les contacts"/"Masquer"),
// au lieu d'une simple petite flèche grise à peine perceptible ; (2) la note
// libre est mise en valeur (label "Note" en gras, texte plus foncé, bordure
// d'accent) au lieu d'un texte italique clair qui se fondait dans le fond.
// Usage : node patch_annuaire_14_appjsx_visibilite_uo.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_13_appjsx_icones_note.js

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

// ── 1. Bouton de dépliage : libellé texte visible au lieu d'une flèche seule ──
const old1 = [
  '                <div style={{display:"flex",alignItems:"center",gap:10}}>',
  '                  <span style={{fontSize:12,color:"#94a3b8",transform:expandedUo.includes(u.id)?"rotate(180deg)":"none",transition:"transform .15s"}}>▾</span>',
  '                  <button onClick={(e)=>{e.stopPropagation();setEditUoId(u.id);}} style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:"#94a3b8"}}>✎</button>',
  '                </div>',
].join(NL);

const new1 = [
  '                <div style={{display:"flex",alignItems:"center",gap:8}}>',
  '                  <span style={{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:700,color:"#0C447C",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:20,padding:"5px 10px",whiteSpace:"nowrap"}}>',
  '                    {expandedUo.includes(u.id)?"Masquer":"Voir les contacts"}',
  '                    <span style={{transform:expandedUo.includes(u.id)?"rotate(180deg)":"none",transition:"transform .15s",display:"inline-block"}}>▾</span>',
  '                  </span>',
  '                  <button onClick={(e)=>{e.stopPropagation();setEditUoId(u.id);}} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#64748b"}}>✎</button>',
  '                </div>',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'uo-bouton-deplier-visible');

// ── 2. Note libre : mise en valeur (label + texte plus foncé + bordure d'accent) ──
const old2 = '                {u.note&&<div style={{marginTop:10,fontSize:12,color:"#475569",fontStyle:"italic",background:"#f8fafc",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0"}}>📝 {u.note}</div>}';
const new2 = [
  '                {u.note&&<div style={{marginTop:10,padding:"8px 10px",borderRadius:8,background:"#fffbeb",borderLeft:"4px solid #f59e0b"}}>',
  '                  <div style={{fontSize:10,fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:2}}>📝 Note</div>',
  '                  <div style={{fontSize:13,color:"#1e293b",fontWeight:500}}>{u.note}</div>',
  '                </div>}',
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'uo-note-visible');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (bouton "Voir les contacts" visible, note UO mise en valeur)');
