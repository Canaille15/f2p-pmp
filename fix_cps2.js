const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Ajouter handleCpsImport avant le return de GlobalView
const idx = c.indexOf('function GlobalView');
const returnIdx = c.indexOf('return(<div', idx);

const handleFn = `  const handleCpsImport=async(e)=>{
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
            {type:"text",text:'Extrais les affectations. JSON uniquement: {"date":"YYYY-MM-DD","affectations":[{"nom":"NOM","prenom":"PRENOM","jsCode":"CODE","equipe":"M|AM|N|J|CA|RP|RU","horaires":"HH-HH"}]}'}
          ]}]})});
        const data=await res.json();
        const raw=data.content?.map(x=>x.text||"").join("")||"";
        const parsed=JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,"").trim());
        let nb=0,ec=0;
        (parsed.affectations||[]).forEach(aff=>{
          const ag=agents.find(a=>a.nom.toUpperCase()===aff.nom.toUpperCase());
          if(!ag)return;
          const key=ag.id+"-"+parsed.date;
          const existing=schedule[key];
          if(existing&&(existing.equipe!==aff.equipe||existing.jsCode!==aff.jsCode))ec++;
          setSchedule(prev=>({...prev,[key]:{equipe:aff.equipe,jsCode:aff.jsCode,horaires:aff.horaires,prive:false,impressionAt:new Date().toISOString()}}));
          nb++;
        });
        setCpsResult({date:parsed.date,nb,ecarts:ec});
      }catch(err){alert("Erreur: "+err.message);}
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };\r\n  `;

c = c.slice(0, returnIdx) + handleFn + c.slice(returnIdx);
console.log('OK 1 - handleCpsImport ajouté');

// Ajouter bouton import dans le header
const searchInput = c.indexOf('placeholder="🔍 Rechercher…"', c.indexOf('function GlobalView'));
const afterSearch = c.indexOf('/>', searchInput) + 2;

const btnImport = `\r\n      <label style={{cursor:"pointer",flexShrink:0}}>
        <div style={{background:uploading?"#94a3b8":"#0f4c81",color:"#fff",borderRadius:10,padding:"8px 12px",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
          {uploading?"⏳...":"📥 Importer CPS"}
        </div>
        <input type="file" accept=".pdf,image/*" onChange={handleCpsImport} style={{display:"none"}} disabled={uploading}/>
      </label>
      {cpsResult&&<span style={{fontSize:10,background:"#f0fdf4",color:"#16a34a",borderRadius:8,padding:"4px 10px",fontWeight:700}}>✅ {cpsResult.nb} agents · {cpsResult.date}</span>}`;

c = c.slice(0, afterSearch) + btnImport + c.slice(afterSearch);
console.log('OK 2 - bouton ajouté');

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
