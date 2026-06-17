const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `        api.planning.saveEntry(agCp, dk, fullEntry).catch(()=>{});
        if(newEntry.equipe2) {
          const tomorrow=new Date(dk);
          tomorrow.setDate(tomorrow.getDate()+1);
          const tomorrowStr=tomorrow.toISOString().slice(0,10);
          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true,equipe:'N',jsCode:newEntry.jsCodeNuit||null}}));
          api.planning.saveEntry(agCp, tomorrowStr, {equipe:'N', jsCode:newEntry.jsCodeNuit||null, horaires:'22h15\u201306h17', finNuit:true, prive:false}).catch(()=>{});`;

const newCode = `        api.planning.saveEntry(agCp, dk, fullEntry).then(()=>{
          if(newEntry.equipe2) {
            const tomorrow=new Date(dk);
            tomorrow.setDate(tomorrow.getDate()+1);
            const tomorrowStr=tomorrow.toISOString().slice(0,10);
            setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true,equipe:'N',jsCode:newEntry.jsCodeNuit||null}}));
            setTimeout(()=>api.planning.saveEntry(agCp, tomorrowStr, {equipe:'N', jsCode:newEntry.jsCodeNuit||null, horaires:'22h15\u201306h17', finNuit:true, prive:false}).catch(()=>{}), 300);
          }
        }).catch(()=>{});
        if(newEntry.equipe2_placeholder) {`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - saves sequentiels');
} else {
    console.log('ERREUR - texte non trouve');
}
