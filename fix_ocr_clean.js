const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Trouver précisément le début : "const handleCpsImport=async(e)=>{"
const startMarker = 'const handleCpsImport=async(e)=>{';
const startIdx = c.indexOf(startMarker);
if(startIdx === -1) { console.log('ERREUR - debut non trouve'); process.exit(1); }

// Trouver la fin précise : on cherche le bloc "reader.readAsDataURL(file);\n  };" qui suit
// On compte les accolades pour trouver la VRAIE fin de la fonction fléchée
let depth = 0;
let i = startIdx + startMarker.length - 1; // position du { d'ouverture
depth = 1;
i++;
while(depth > 0 && i < c.length) {
  if(c[i] === '{') depth++;
  if(c[i] === '}') depth--;
  i++;
}
// i est maintenant juste après le } final de la fonction fléchée
// Il faut aussi consommer le ";" qui suit s'il y en a un
let endIdx = i;
if(c[endIdx] === ';') endIdx++;

console.log('startIdx:', startIdx, 'endIdx:', endIdx);
console.log('--- ANCIEN CODE (200 premiers caracteres) ---');
console.log(c.slice(startIdx, startIdx+200));
console.log('--- FIN ANCIEN CODE (100 derniers caracteres avant fin) ---');
console.log(c.slice(endIdx-100, endIdx));

const newFn = `const handleCpsImport=async(e)=>{
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

        lines.forEach((line)=>{
          const horaireMatch=line.match(/(\\d{2}):(\\d{2})\\s*-\\s*(\\d{2}):(\\d{2})/);
          if(!horaireMatch) return;

          const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]{2,6}[-OX]?|PI[A-Z0-9]{2,6}[-OX]?)\\b/);
          const jsCode=jsCodeMatch?jsCodeMatch[1]:null;

          const ag=agents.find(a=>line.toUpperCase().includes(a.nom.toUpperCase()));
          if(!ag) return;

          const hDebut=parseInt(horaireMatch[1]);
          let equipe="J";
          if(hDebut>=4&&hDebut<11) equipe="M";
          else if(hDebut>=11&&hDebut<20) equipe="AM";
          else equipe="N";
          if(jsCode&&/J$/.test(jsCode)) equipe="J";

          const key=\`\${ag.id}-\${dateStr}\`;
          const existing=schedule[key];
          const horaires=\`\${horaireMatch[1]}h\${horaireMatch[2]}\u2013\${horaireMatch[3]}h\${horaireMatch[4]}\`;

          if(existing&&(existing.equipe!==equipe||existing.jsCode!==jsCode)) ec++;
          updates.push({key,equipe,jsCode,horaires});
          nb++;
        });

        if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");

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
console.log('OK - fonction remplacee proprement');
