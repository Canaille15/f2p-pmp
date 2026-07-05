// Patch 15 — Annuaire : l'onglet Agents affiche désormais le numéro et
// l'email en clair (bouton visible avec icône + texte, même style que UO),
// au lieu de simples icônes sans texte — permet de vérifier visuellement
// qu'un import (ex: vCard) a bien fonctionné. Tailles et contraste augmentés
// pour une meilleure lisibilité sur ordinateur.
// Usage : node patch_annuaire_15_appjsx_agents_visibles.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_14_appjsx_visibilite_uo.js

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

const old1 = [
  '        {filtreAgents.map(a=>(',
  '          <div key={a.cp} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '            <div style={{flex:1,minWidth:0}}>',
  '              <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{a.nom?.toUpperCase()} <span style={{fontWeight:500}}>{a.prenom}</span></div>',
  '              <div style={{fontSize:11,color:"#94a3b8"}}>{a.fonction||a.grade||""}</div>',
  '            </div>',
  '            {a.telephone&&<a href={`tel:${a.telephone}`} style={{textDecoration:"none",width:28,height:28,borderRadius:"50%",background:"#fef2f2",border:"1.5px solid #fecaca",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} title="Appeler"><IconTel size={14}/></a>}',
  '            {a.telephone&&<a href={`sms:${a.telephone}`} style={{textDecoration:"none",fontSize:17}} title="SMS">💬</a>}',
  '            {a.email&&<a href={`mailto:${a.email}`} style={{textDecoration:"none",fontSize:17}} title="Envoyer un email">✉️</a>}',
  '            {!a.telephone&&!a.email&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>Non communiqué</span>}',
  '          </div>',
  '        ))}',
].join(NL);

const new1 = [
  '        {filtreAgents.map(a=>(',
  '          <div key={a.cp} style={{display:"flex",flexDirection:"column",gap:8,padding:"12px 4px",borderBottom:"1px solid #f1f5f9"}}>',
  '            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>',
  '              <div>',
  '                <div style={{fontWeight:700,fontSize:16,color:"#1e293b"}}>{a.nom?.toUpperCase()} <span style={{fontWeight:500}}>{a.prenom}</span></div>',
  '                <div style={{fontSize:13,color:"#64748b",fontWeight:500}}>{a.fonction||a.grade||""}</div>',
  '              </div>',
  '              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>',
  '                {a.telephone&&<a href={`tel:${a.telephone}`} style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none",padding:"7px 12px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca"}}>',
  '                  <IconTel size={15}/>',
  '                  <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{a.telephone}</span>',
  '                </a>}',
  '                {a.email&&<a href={`mailto:${a.email}`} style={{display:"flex",alignItems:"center",gap:7,textDecoration:"none",padding:"7px 12px",borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe"}}>',
  '                  <span style={{fontSize:15}}>✉️</span>',
  '                  <span style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>{a.email}</span>',
  '                </a>}',
  '                {!a.telephone&&!a.email&&<span style={{fontSize:13,color:"#64748b",fontWeight:600}}>Non communiqué</span>}',
  '              </div>',
  '            </div>',
  '          </div>',
  '        ))}',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'agents-numeros-visibles');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (onglet Agents : numéros/emails visibles, taille et contraste augmentés)');
