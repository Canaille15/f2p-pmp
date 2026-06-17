const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `          const nuitEntry = {
            ...(prev_s[agCp+'-'+tomorrowStr]||{}),
            finNuit: true,
            equipe: 'N',
            jsCode: newEntry.jsCodeNuit || null,
          };
          setSchedule(prev_s=>({...prev_s,[agCp+'-'+tomorrowStr]:nuitEntry}));
          api.planning.saveEntry(agCp, tomorrowStr, {equipe:'N', jsCode:newEntry.jsCodeNuit||null, horaires:'22h15\u201306h17', finNuit:true, prive:false}).catch(()=>{});`;

const newCode = `          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true,equipe:'N',jsCode:newEntry.jsCodeNuit||null}}));
          api.planning.saveEntry(agCp, tomorrowStr, {equipe:'N', jsCode:newEntry.jsCodeNuit||null, horaires:'22h15\u201306h17', finNuit:true, prive:false}).catch(()=>{});`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - fix prev_s');
} else {
    // Chercher l'ancienne version
    const old2 = `          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true}}));`;
    if (c.includes(old2)) {
        const newCode2 = `          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true,equipe:'N',jsCode:newEntry.jsCodeNuit||null}}));
          api.planning.saveEntry(agCp, tomorrowStr, {equipe:'N', jsCode:newEntry.jsCodeNuit||null, horaires:'22h15\u201306h17', finNuit:true, prive:false}).catch(()=>{});`;
        c = c.replace(old2, newCode2);
        fs.writeFileSync(f, c, 'utf8');
        console.log('OK - propagation nuit corrigee');
    } else {
        console.log('ERREUR - texte non trouve');
    }
}
