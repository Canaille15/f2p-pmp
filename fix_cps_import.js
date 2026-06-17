const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Ajouter la logique d'import CPS dans GlobalView (après la déclaration des states)
const oldState = `const [dayIdx,setDayIdx]=useState(()=>{const d=new Date().getDay();return d===0?6:d-1;});
  const [filterF,setFilterF]=useState("ALL");
  const [search,setSearch]=useState("");`;

const newState = `const [dayIdx,setDayIdx]=useState(()=>{const d=new Date().getDay();return d===0?6:d-1;});
  const [filterF,setFilterF]=useState("ALL");
  const [search,setSearch]=useState("");
  const [uploading,setUploading]=useState(false);
  const [cpsResult,setCpsResult]=useState(null);

  const handleCpsImport=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      const mt=file.type==="application/pdf"?"application/pdf":file.type;
      try{
        const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:4000,messages:[{role:"user",content:[
            {type:"document",source:{type:"base64",media_type:mt,data:b64}},
            {type:"text",text:\`Tu analyses une feuille de présence officielle SNCF (CPS). Extrais toutes les affectations de tous les agents présents. Retourne UNIQUEMENT un JSON valide sans markdown : {"date":"YYYY-MM-DD","affectations":[{"nom":"NOM","prenom":"PRENOM","jsCode":"PICCL-","equipe":"M|AM|N|J|CA|RP|RU","horaires":"06h10–14h17","impressionAt":"YYYY-MM-DD HH:MM"}]}\`}
          ]}]})});
        const data=await res.json();
        const raw=data.content?.map(x=>x.text||"").join("")||"";
        const parsed=JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,"").trim());
        const ecarts=[];
        const updates=[];
        (parsed.affectations||[]).forEach(aff=>{
          const ag=agents.find(a=>a.nom.toUpperCase()===aff.nom.toUpperCase()||a.prenom.toUpperCase()===aff.prenom.toUpperCase());
          if(!ag)return;
          const key=\`\${ag.id}-\${parsed.date}\`;
          const existing=schedule[key];
          updates.push({agentId:ag.id,date:parsed.date,key,cpsEntry:{equipe:aff.equipe,jsCode:aff.jsCode,horaires:aff.horaires,impressionAt:aff.impressionAt,prive:false},existingEntry:existing});
          if(existing&&(existing.equipe!==aff.equipe||existing.jsCode!==aff.jsCode)){
            ecarts.push({agent:ag,date:parsed.date,cps:aff,existant:existing});
          }
        });
        // Appliquer au schedule
        if(typeof setSchedule==="function"){
          setSchedule(prev=>{
            const next={...prev};
            updates.forEach(u=>{next[u.key]={...u.cpsEntry};});
            return next;
          });
        }
        // Notifications écarts
        if(ecarts.length>0&&typeof setNotifications==="function"){
          setNotifications(prev=>[...prev,...ecarts.map(e=>({
            id:Date.now()+Math.random(),
            agentId:e.agent.id,
            agentNom:\`\${e.agent.prenom} \${e.agent.nom}\`,
            date:e.date,
            message:\`Écart CPS le \${e.date} : CPS=\${e.cps.jsCode||e.cps.equipe} / Planning=\${e.existant?.jsCode||e.existant?.equipe||"—"}\`,
            acquitte:false,
          }))]);
        }
        setCpsResult({date:parsed.date,nb:updates.length,ecarts:ecarts.length});
        setDayIdx(()=>{const dk=parsed.date;const d=new Date(dk).getDay();return d===0?6:d-1;});
      }catch(err){alert("Erreur lecture CPS : "+err.message);}
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };`;

if(c.includes(oldState)) {
  c = c.replace(oldState, newState);
  console.log('OK 1 - logique import ajoutée');
} else {
  console.log('ERREUR 1');
}

// 2. Ajouter le bouton import CPS dans le header de GlobalView
const oldHeader = `<input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
        style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 14px",fontSize:13,flex:1,minWidth:140,outline:"none"}}/>`;

const newHeader = `<input placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}
        style={{border:"1.5px solid #e2e8f0",borderRadius:10,padding:"8px 14px",fontSize:13,flex:1,minWidth:140,outline:"none"}}/>
      <label style={{cursor:"pointer",flexShrink:0}}>
        <div style={{background:uploading?"#94a3b8":"#0f4c81",color:"#fff",borderRadius:10,padding:"8px 12px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
          {uploading?"⏳ Analyse...":"📥 Importer CPS"}
        </div>
        <input type="file" accept=".pdf,image/*" onChange={handleCpsImport} style={{display:"none"}} disabled={uploading}/>
      </label>
      {cpsResult&&<div style={{fontSize:10,background:"#f0fdf4",color:"#16a34a",borderRadius:8,padding:"4px 10px",fontWeight:700}}>
        ✅ {cpsResult.nb} agents · {cpsResult.date}{cpsResult.ecarts>0?<span style={{color:"#f59e0b"}}> · ⚠️ {cpsResult.ecarts} écart{cpsResult.ecarts>1?"s":""}</span>:null}
      </div>}`;

if(c.includes(oldHeader)) {
  c = c.replace(oldHeader, newHeader);
  console.log('OK 2 - bouton import ajouté');
} else {
  console.log('ERREUR 2');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
