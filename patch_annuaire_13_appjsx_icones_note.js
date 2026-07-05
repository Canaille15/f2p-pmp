// Patch 13 — Annuaire : (1) icône téléphone SVG unique et réutilisable
// (même dessin que le menu latéral) utilisée dans Agents ET UO ; (2) les
// numéros UO deviennent de vrais boutons d'appel visibles (fond teinté,
// libellé, gros texte) au lieu d'un simple texte coloré peu visible ;
// (3) champ "Note libre" ajouté aux fiches UO, affiché seulement s'il est
// rempli (n'ajoute pas de charge visuelle sinon).
// Usage : node patch_annuaire_13_appjsx_icones_note.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp
// PRÉREQUIS : avoir déjà exécuté patch_annuaire_12_appjsx_icone_svg.js
// PRÉREQUIS SQL : ALTER TABLE annuaire_uo ADD COLUMN note TEXT NULL;
//                 (voir migration_annuaire_note_uo.sql)
// PRÉREQUIS BACKEND : remplacer annuaireController.js par la version mise à
//                      jour (support du champ "note").

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

// ══════════════ 1. Icône d'appel unifiée dans l'onglet Agents ══════════════

const old1 = '            {a.telephone&&<a href={`tel:${a.telephone}`} style={{textDecoration:"none",fontSize:14,color:"#fff",background:"#D22B2B",width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} title="Appeler">📞</a>}';
const new1 = '            {a.telephone&&<a href={`tel:${a.telephone}`} style={{textDecoration:"none",width:28,height:28,borderRadius:"50%",background:"#fef2f2",border:"1.5px solid #fecaca",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} title="Appeler"><IconTel size={14}/></a>}';
content = mustReplaceOnce(content, old1, new1, 'agents-icone-appel');

// ══════════════ 2. UO : boutons d'appel visibles + note libre ══════════════

const old2 = [
  '              {expandedUo.includes(u.id)&&<div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:8}}>',
  '                <ContactLigne label="Mobile pro" valeur={u.mobile_pro}/>',
  '                <ContactLigne label="Mobile perso" valeur={u.mobile_perso}/>',
  '                <ContactLigne label="Fixe" valeur={u.fixe}/>',
  '                {u.email&&<a href={`mailto:${u.email}`} style={{fontSize:12,color:"#0C447C",textDecoration:"none"}}>✉️ {u.email}</a>}',
  '                {!u.mobile_pro&&!u.mobile_perso&&!u.fixe&&!u.email&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>Aucun contact renseigné</span>}',
  '              </div>}',
].join(NL);

const new2 = [
  '              {expandedUo.includes(u.id)&&<div style={{marginTop:10}}>',
  '                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>',
  '                  <ContactLigne label="Mobile pro" valeur={u.mobile_pro}/>',
  '                  <ContactLigne label="Mobile perso" valeur={u.mobile_perso}/>',
  '                  <ContactLigne label="Fixe" valeur={u.fixe}/>',
  '                  {u.email&&<a href={`mailto:${u.email}`} style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none",padding:"7px 10px",borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe"}}>',
  '                    <span style={{fontSize:15}}>✉️</span>',
  '                    <div>',
  '                      <div style={{fontSize:10,fontWeight:700,color:"#0C447C",textTransform:"uppercase",letterSpacing:"0.03em"}}>Email</div>',
  '                      <div style={{fontSize:13,fontWeight:700,color:"#1e293b",wordBreak:"break-all"}}>{u.email}</div>',
  '                    </div>',
  '                  </a>}',
  '                </div>',
  '                {!u.mobile_pro&&!u.mobile_perso&&!u.fixe&&!u.email&&<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>Aucun contact renseigné</span>}',
  '                {u.note&&<div style={{marginTop:10,fontSize:12,color:"#475569",fontStyle:"italic",background:"#f8fafc",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0"}}>📝 {u.note}</div>}',
  '              </div>}',
].join(NL);

content = mustReplaceOnce(content, old2, new2, 'uo-contacts-boutons-note');

// ── ContactLigne : bouton d'appel visible (icône + libellé + gros numéro) ──
const old3 = [
  'function ContactLigne({label,valeur}){',
  '  if(!valeur)return null;',
  '  return(<a href={`tel:${valeur}`} style={{fontSize:12,color:"#D22B2B",fontWeight:600,textDecoration:"none"}}>{label==="Fixe"?"☎️":"📱"} {valeur}</a>);',
  '}',
].join(NL);

const new3 = [
  'function IconTel({size}){',
  '  const s=size||16;',
  '  return(<svg width={s} height={s} viewBox="0 0 24 24" fill="#D22B2B" style={{flexShrink:0}}><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.24 1.01l-2.21 2.21z"/></svg>);',
  '}',
  '',
  'function ContactLigne({label,valeur}){',
  '  if(!valeur)return null;',
  '  return(<a href={`tel:${valeur}`} style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none",padding:"7px 10px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca"}}>',
  '    <IconTel size={15}/>',
  '    <div>',
  '      <div style={{fontSize:10,fontWeight:700,color:"#991b1b",textTransform:"uppercase",letterSpacing:"0.03em"}}>{label}</div>',
  '      <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{valeur}</div>',
  '    </div>',
  '  </a>);',
  '}',
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'contactligne-bouton-appel');

// ══════════════ 3. UoForm : champ Note libre + payload ══════════════

const old4 = [
  '  const [fixe,setFixe]=useState(initial?.fixe||"");',
  '  const [email,setEmail]=useState(initial?.email||"");',
  '  const [busy,setBusy]=useState(false);',
  '  const [err,setErr]=useState(null);',
  '  const valider=async()=>{',
  '    if(!fonction.trim()){setErr("Le poste/fonction est obligatoire");return;}',
  '    setBusy(true);setErr(null);',
  '    const data={fonction,titulaire_nom:titulaireNom,titulaire_prenom:titulairePrenom,mobile_pro:mobilePro,mobile_perso:mobilePerso,fixe,email};',
].join(NL);

const new4 = [
  '  const [fixe,setFixe]=useState(initial?.fixe||"");',
  '  const [email,setEmail]=useState(initial?.email||"");',
  '  const [note,setNote]=useState(initial?.note||"");',
  '  const [busy,setBusy]=useState(false);',
  '  const [err,setErr]=useState(null);',
  '  const valider=async()=>{',
  '    if(!fonction.trim()){setErr("Le poste/fonction est obligatoire");return;}',
  '    setBusy(true);setErr(null);',
  '    const data={fonction,titulaire_nom:titulaireNom,titulaire_prenom:titulairePrenom,mobile_pro:mobilePro,mobile_perso:mobilePerso,fixe,email,note};',
].join(NL);

content = mustReplaceOnce(content, old4, new4, 'uoform-note-hook');

const old5 = [
  '    <div>',
  '      <label style={labelStyle}>Email</label>',
  '      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={champStyle}/>',
  '    </div>',
  '    {err&&<div style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{err}</div>}',
].join(NL);

const new5 = [
  '    <div>',
  '      <label style={labelStyle}>Email</label>',
  '      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={champStyle}/>',
  '    </div>',
  '    <div>',
  '      <label style={labelStyle}>Note libre (optionnel)</label>',
  '      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{...champStyle,resize:"vertical",fontFamily:"inherit"}}/>',
  '    </div>',
  '    {err&&<div style={{fontSize:13,fontWeight:600,color:"#991b1b"}}>{err}</div>}',
].join(NL);

content = mustReplaceOnce(content, old5, new5, 'uoform-note-champ');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (icône téléphone unifiée, boutons UO visibles, note libre UO)');
