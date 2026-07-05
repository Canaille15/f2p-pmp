// Patch 9 — Annuaire : (1) affichage "NOM Prénom" dans l'onglet Agents pour
// que l'ordre visuel corresponde au tri alphabétique par nom (au lieu de
// "Prénom Nom" qui semblait fouilli) ; (2) icône téléphone en rouge dans
// Agents et UO ; (3) UoForm plus contrasté et plus grand (labels visibles,
// bordures plus marquées, police agrandie) pour la création de fiches UO.
// Usage : node patch_annuaire_9_appjsx_contraste.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_8_appjsx_agents_uo.js

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

// ── 1. Ligne Agent : "NOM Prénom" + icône téléphone rouge ──
const old1 = [
  '        {filtreAgents.map(a=>(',
  '          <div key={a.cp} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '            <div style={{flex:1,minWidth:0}}>',
  '              <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{a.prenom} {a.nom}</div>',
  '              <div style={{fontSize:11,color:"#94a3b8"}}>{a.fonction||a.grade||""}</div>',
  '            </div>',
  '            {a.telephone&&<a href={`tel:${a.telephone}`} style={{textDecoration:"none",fontSize:17}} title="Appeler">📞</a>}',
  '            {a.telephone&&<a href={`sms:${a.telephone}`} style={{textDecoration:"none",fontSize:17}} title="SMS">💬</a>}',
  '            {a.email&&<a href={`mailto:${a.email}`} style={{textDecoration:"none",fontSize:17}} title="Envoyer un email">✉️</a>}',
  '            {!a.telephone&&!a.email&&<span style={{fontSize:12,color:"#cbd5e1"}}>Non communiqué</span>}',
  '          </div>',
  '        ))}',
].join(NL);

const new1 = [
  '        {filtreAgents.map(a=>(',
  '          <div key={a.cp} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '            <div style={{flex:1,minWidth:0}}>',
  '              <div style={{fontWeight:600,fontSize:13,color:"#1e293b"}}>{a.nom?.toUpperCase()} <span style={{fontWeight:500}}>{a.prenom}</span></div>',
  '              <div style={{fontSize:11,color:"#94a3b8"}}>{a.fonction||a.grade||""}</div>',
  '            </div>',
  '            {a.telephone&&<a href={`tel:${a.telephone}`} style={{textDecoration:"none",fontSize:14,color:"#fff",background:"#D22B2B",width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} title="Appeler">📞</a>}',
  '            {a.telephone&&<a href={`sms:${a.telephone}`} style={{textDecoration:"none",fontSize:17}} title="SMS">💬</a>}',
  '            {a.email&&<a href={`mailto:${a.email}`} style={{textDecoration:"none",fontSize:17}} title="Envoyer un email">✉️</a>}',
  '            {!a.telephone&&!a.email&&<span style={{fontSize:12,color:"#cbd5e1"}}>Non communiqué</span>}',
  '          </div>',
  '        ))}',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'agent-row-nom-prenom-icone');

// ── 2. ContactLigne (contacts UO) : téléphone en rouge au lieu de bleu ──
const old2 = [
  'function ContactLigne({label,valeur}){',
  '  if(!valeur)return null;',
  '  return(<a href={`tel:${valeur}`} style={{fontSize:12,color:"#0C447C",textDecoration:"none"}}>{label==="Fixe"?"☎️":"📱"} {valeur}</a>);',
  '}',
].join(NL);

const new2 = [
  'function ContactLigne({label,valeur}){',
  '  if(!valeur)return null;',
  '  return(<a href={`tel:${valeur}`} style={{fontSize:12,color:"#D22B2B",fontWeight:600,textDecoration:"none"}}>{label==="Fixe"?"☎️":"📱"} {valeur}</a>);',
  '}',
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'contactligne-couleur-rouge');

// ── 3. UoForm : contraste et taille augmentés, labels visibles au-dessus de chaque champ ──
const old3 = [
  '  return(<div style={{display:"flex",flexDirection:"column",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>',
  '    <input placeholder="Poste / fonction (ex: Assistant RH)" value={fonction} onChange={e=>setFonction(e.target.value)}',
  '      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
  '    <div style={{display:"flex",gap:8}}>',
  '      <input placeholder="Prénom titulaire" value={titulairePrenom} onChange={e=>setTitulairePrenom(e.target.value)}',
  '        style={{flex:1,padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
  '      <input placeholder="Nom titulaire" value={titulaireNom} onChange={e=>setTitulaireNom(e.target.value)}',
  '        style={{flex:1,padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
  '    </div>',
  '    <input placeholder="Mobile pro" value={mobilePro} onChange={e=>setMobilePro(e.target.value)}',
  '      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
  '    <input placeholder="Mobile perso" value={mobilePerso} onChange={e=>setMobilePerso(e.target.value)}',
  '      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
  '    <input placeholder="Fixe" value={fixe} onChange={e=>setFixe(e.target.value)}',
  '      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
].join(NL);

const new3 = [
  '  const champStyle={width:"100%",padding:"11px 13px",border:"1.5px solid #94a3b8",borderRadius:9,fontSize:15,color:"#1e293b",background:"#fff"};',
  '  const labelStyle={fontSize:12,fontWeight:700,color:"#334155",marginBottom:4,display:"block"};',
  '  return(<div style={{display:"flex",flexDirection:"column",gap:12,padding:"14px",borderRadius:12,border:"1.5px solid #cbd5e1",background:"#f8fafc",marginBottom:6}}>',
  '    <div>',
  '      <label style={labelStyle}>Poste / fonction</label>',
  '      <input placeholder="ex: Assistant RH" value={fonction} onChange={e=>setFonction(e.target.value)} style={champStyle}/>',
  '    </div>',
  '    <div style={{display:"flex",gap:10}}>',
  '      <div style={{flex:1}}>',
  '        <label style={labelStyle}>Prénom titulaire</label>',
  '        <input value={titulairePrenom} onChange={e=>setTitulairePrenom(e.target.value)} style={champStyle}/>',
  '      </div>',
  '      <div style={{flex:1}}>',
  '        <label style={labelStyle}>Nom titulaire</label>',
  '        <input value={titulaireNom} onChange={e=>setTitulaireNom(e.target.value)} style={champStyle}/>',
  '      </div>',
  '    </div>',
  '    <div>',
  '      <label style={labelStyle}>Mobile pro</label>',
  '      <input value={mobilePro} onChange={e=>setMobilePro(e.target.value)} style={champStyle}/>',
  '    </div>',
  '    <div>',
  '      <label style={labelStyle}>Mobile perso</label>',
  '      <input value={mobilePerso} onChange={e=>setMobilePerso(e.target.value)} style={champStyle}/>',
  '    </div>',
  '    <div>',
  '      <label style={labelStyle}>Fixe</label>',
  '      <input value={fixe} onChange={e=>setFixe(e.target.value)} style={champStyle}/>',
  '    </div>',
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'uoform-contraste');

// ── 4. UoForm : champ email + boutons, adaptés au nouveau style (champStyle/labelStyle) ──
const old4 = [
  '    <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}',
  '      style={{padding:"9px 11px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13}}/>',
  '    {err&&<div style={{fontSize:12,color:"#991b1b"}}>{err}</div>}',
  '    <div style={{display:"flex",gap:8}}>',
  '      <button onClick={valider} disabled={busy} style={{flex:1,padding:"9px 0",border:"none",borderRadius:9,fontWeight:700,fontSize:13,cursor:"pointer",background:"#0C447C",color:"#fff"}}>{busy?"…":"Enregistrer"}</button>',
  '      <button onClick={onCancel} style={{padding:"9px 14px",border:"1.5px solid #e2e8f0",borderRadius:9,fontWeight:600,fontSize:13,cursor:"pointer",background:"#fff",color:"#64748b"}}>Annuler</button>',
  '      {initial&&onDelete&&<button onClick={onDelete} style={{padding:"9px 14px",border:"none",borderRadius:9,fontWeight:600,fontSize:13,cursor:"pointer",background:"#fee2e2",color:"#991b1b"}}>Suppr.</button>}',
  '    </div>',
  '  </div>);',
  '}',
  '',
  'function ImportDeroulement',
].join(NL);

const new4 = [
  '    <div>',
  '      <label style={labelStyle}>Email</label>',
  '      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={champStyle}/>',
  '    </div>',
  '    {err&&<div style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{err}</div>}',
  '    <div style={{display:"flex",gap:8}}>',
  '      <button onClick={valider} disabled={busy} style={{flex:1,padding:"11px 0",border:"none",borderRadius:9,fontWeight:700,fontSize:14,cursor:"pointer",background:"#0C447C",color:"#fff"}}>{busy?"…":"Enregistrer"}</button>',
  '      <button onClick={onCancel} style={{padding:"11px 16px",border:"1.5px solid #94a3b8",borderRadius:9,fontWeight:600,fontSize:14,cursor:"pointer",background:"#fff",color:"#334155"}}>Annuler</button>',
  '      {initial&&onDelete&&<button onClick={onDelete} style={{padding:"11px 16px",border:"none",borderRadius:9,fontWeight:600,fontSize:14,cursor:"pointer",background:"#fee2e2",color:"#991b1b"}}>Suppr.</button>}',
  '    </div>',
  '  </div>);',
  '}',
  '',
  'function ImportDeroulement',
].join(NL);

content = mustReplaceOnce(content, old4, new4, 'uoform-email-boutons');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (ordre Nom/Prénom, icône téléphone rouge, UoForm contrasté)');
