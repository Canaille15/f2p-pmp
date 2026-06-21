const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const oldBlock = fs.readFileSync('current_parsing_block.txt', 'utf8').replace(/\n$/, '');

const newBlock = `const rawLines=text.split(/\\n/).map(l=>l.trim()).filter(Boolean);
        // Fusionner les lignes : si une ligne ne contient pas de debut d'horaire (HH:MM en debut/proche du debut)
        // et ne commence pas par un jsCode connu, on la rattache a la ligne precedente (cas OCR qui scinde
        // le jsCode+debut d'horaire d'un cote et la fin d'horaire+nom de l'autre cote)
        const jsCodeStartRe=/^[#*€|]?\\s*(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?|SD%|F-PRCI|AFOPRCI|CAF|PPRCI|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI)\\b/;
        const lines=[];
        rawLines.forEach(line=>{
          const hasFullHoraire=/\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}/.test(line);
          const startsNewBlock=jsCodeStartRe.test(line)||hasFullHoraire;
          if(startsNewBlock||lines.length===0){
            lines.push(line);
          }else{
            lines[lines.length-1]=lines[lines.length-1]+" "+line;
          }
        });
        let nb=0,ec=0;
        const updates=[];
        lines.forEach((line)=>{
          const horaireMatch=line.match(/(\\d{2}):(\\d{2})\\s*-\\s*(\\d{2}):(\\d{2})/);
          if(!horaireMatch) return;
          const jsCodeMatch=line.match(/\\b(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?|SD%|F-PRCI|AFOPRCI|CAF|PPRCI|VM|AFO PAR|K-PAR|F-PAR|K-PRCI|A-PRCI)\\b/);
          let jsCode=jsCodeMatch?jsCodeMatch[1]:null;
          if(jsCode&&/PA[A-Z]+1[0]$/.test(jsCode)) jsCode=jsCode.slice(0,-1)+"O";
          if(jsCode&&/OR$/.test(jsCode)) jsCode=jsCode.slice(0,-1); // fix OCR : R parasite apres O
          if(jsCode&&/PIADIX$/.test(jsCode)) jsCode="PIADJX"; // fix OCR : I lu au lieu de J
          if(jsCode&&/^PAACIX$/.test(jsCode)) jsCode="PAAC1X"; // fix OCR : I lu au lieu de 1
          if(jsCode&&/^PAACIO$/.test(jsCode)) jsCode="PAAC1O"; // fix OCR : I lu au lieu de 1
          if(jsCode&&/^PAACI-$/.test(jsCode)) jsCode="PAAC1-"; // fix OCR : I lu au lieu de 1
          const candidats=agents.filter(a=>line.toUpperCase().includes(a.nom.toUpperCase()));
          const ag=candidats.length<=1?candidats[0]:candidats.find(a=>a.prenom&&line.toUpperCase().includes(a.prenom.toUpperCase()))||candidats[0];
          if(!ag) return;
          const hDebut=parseInt(horaireMatch[1]);
          let equipe="J";
          if(hDebut>=4&&hDebut<11) equipe="M";
          else if(hDebut>=11&&hDebut<20) equipe="AM";
          else equipe="N";
          if(jsCode&&/J$/.test(jsCode)) equipe="J";
          // Detection statuts speciaux (Formation, VM) - cherche dans la ligne fusionnee et la suivante
          const ligneEtSuivante=(lines[lines.indexOf(line)+1]||"")+" "+line;
          if(/formation/i.test(ligneEtSuivante)) equipe="FOR";
          else if(/\\bVM\\b/.test(ligneEtSuivante)) equipe="VM";
          const key=\`\${ag.id}-\${dateStr}\`;
          const existing=schedule[key];
          const horaires=\`\${horaireMatch[1]}h\${horaireMatch[2]}–\${horaireMatch[3]}h\${horaireMatch[4]}\`;
          if(existing&&(existing.equipe!==equipe||existing.jsCode!==jsCode)) ec++;
          updates.push({key,equipe,jsCode,horaires,cp_agent:ag.id,date_jour:dateStr,famille:ag.fam||"PAR"});
          nb++;
        });`;

if (c.includes(oldBlock)) {
  c = c.replace(oldBlock, newBlock);
  fs.writeFileSync('src/App.jsx', c, 'utf8');
  console.log('OK - parsing par blocs fusionnes mis en place');
} else {
  console.log('ERREUR - bloc exact non trouve, verification...');
  console.log('Longueur attendue:', oldBlock.length);
}
