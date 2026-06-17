const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const startMarker = 'const dateMatch=text.match(/DU\\s*:\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/);';
const startIdx = c.indexOf(startMarker);
const endMarker = 'if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Vérifiez le format.");';
const endIdx = c.indexOf(endMarker) + endMarker.length;

if(startIdx === -1) { console.log('ERREUR - marqueur debut non trouve'); process.exit(1); }
if(endIdx === -1) { console.log('ERREUR - marqueur fin non trouve'); process.exit(1); }

const newLogic = `const dateMatch=text.match(/DU\\s*:\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
        const dateStr=dateMatch?\`\${dateMatch[3]}-\${dateMatch[2]}-\${dateMatch[1]}\`:new Date().toISOString().slice(0,10);

        const lines=text.split(/\\n/).map(l=>l.trim()).filter(Boolean);
        let nb=0,ec=0;
        const updates=[];

        lines.forEach((line)=>{
          const horaireMatch=line.match(/(\\d{2}):(\\d{2})\\s*-\\s*(\\d{2}):(\\d{2})/);
          if(!horaireMatch) return;

          const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]{2,6}[-OX]?|PI[A-Z0-9]{2,6}[-OX]?)\\b/);
          const jsCode=jsCodeMatch?jsCodeMatch[1]:null;

          const ag=agents.find(a=>{
            const nomUp=a.nom.toUpperCase();
            return line.toUpperCase().includes(nomUp);
          });
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

        if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");`;

c = c.slice(0, startIdx) + newLogic + c.slice(endIdx);
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - logique de parsing amelioree');
