const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const idx = c.indexOf('handleCpsImport');
const startIdx = c.lastIndexOf('const', idx);
const endMarker = 'reader.readAsDataURL(file);\r\n  };';
const endIdx = c.indexOf(endMarker, idx) + endMarker.length;

const newFn = `handleCpsImport=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setUploading(true);
    setCpsResult(null);
    const reader=new FileReader();
    reader.onload=async()=>{
      const b64=reader.result.split(",")[1];
      try{
        const form=new URLSearchParams();
        form.append("apikey","K85147389088957");
        form.append("base64Image","data:"+(file.type||"application/pdf")+";base64,"+b64);
        form.append("filetype",file.type==="application/pdf"?"PDF":"Auto");
        form.append("OCREngine","2");
        form.append("isTable","true");
        const ocrRes=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:form});
        const ocrData=await ocrRes.json();
        if(ocrData.IsErroredOnProcessing) throw new Error(ocrData.ErrorMessage?.[0]||"Erreur OCR");
        const text=ocrData.ParsedResults?.map(r=>r.ParsedText).join("\\n")||"";
        if(!text) throw new Error("Aucun texte extrait du document");

        const dateMatch=text.match(/DU\\s*:\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
        const dateStr=dateMatch?\`\${dateMatch[3]}-\${dateMatch[2]}-\${dateMatch[1]}\`:new Date().toISOString().slice(0,10);

        const lines=text.split(/\\n/).map(l=>l.trim()).filter(Boolean);
        let nb=0,ec=0;
        const updates=[];

        lines.forEach((line,i)=>{
          const nomMatch=line.match(/\\b([A-ZÀ-Ü][A-ZÀ-Ü\\-' ]{2,})\\s+([A-Z][a-zà-ü]+)\\b/);
          if(!nomMatch) return;
          const nom=nomMatch[1].trim();
          const ag=agents.find(a=>a.nom.toUpperCase()===nom.toUpperCase());
          if(!ag) return;

          const contextLines=lines.slice(Math.max(0,i-6),i+1).join(" ");
          const horaireMatch=contextLines.match(/(\\d{2}):(\\d{2})\\s*-\\s*\\n?\\s*(\\d{2}):(\\d{2})/);
          const jsCodeMatch=contextLines.match(/\\b(PA[A-Z0-9]{2,6}[-OX]?|PI[A-Z0-9]{2,6}[-OX]?)\\b/);

          let equipe=null;
          if(horaireMatch){
            const hDebut=parseInt(horaireMatch[1]);
            if(hDebut>=4&&hDebut<11) equipe="M";
            else if(hDebut>=11&&hDebut<20) equipe="AM";
            else equipe="N";
          }
          if(!equipe) return;

          const key=\`\${ag.id}-\${dateStr}\`;
          const existing=schedule[key];
          const horaires=horaireMatch?\`\${horaireMatch[1]}h\${horaireMatch[2]}–\${horaireMatch[3]}h\${horaireMatch[4]}\`:null;
          const jsCode=jsCodeMatch?jsCodeMatch[1]:null;

          if(existing&&(existing.equipe!==equipe||existing.jsCode!==jsCode)) ec++;
          updates.push({key,equipe,jsCode,horaires});
          nb++;
        });

        if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Vérifiez le format.");

        setSchedule(prev=>{
          const next={...prev};
          updates.forEach(u=>{next[u.key]={equipe:u.equipe,jsCode:u.jsCode,horaires:u.horaires,prive:false,impressionAt:new Date().toISOString()};});
          return next;
        });
        setCpsResult({date:dateStr,nb,ecarts:ec});
      }catch(err){
        alert("Erreur import CPS : "+err.message);
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };`;

c = c.slice(0, startIdx) + newFn + c.slice(endIdx);
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - OCR.space intégré');
