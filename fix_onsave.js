const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `onSave={(newEntry)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        setDay(dayPopup.dk, newEntry.equipe);
        if(newEntry.equipe2) {
          const tomorrow=new Date(dayPopup.dk);
          tomorrow.setDate(tomorrow.getDate()+1);
          const tomorrowStr=tomorrow.toISOString().slice(0,10);
          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true}}));
        }`;

const newCode = `onSave={(newEntry)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const fullEntry={
          equipe:   newEntry.equipe||null,
          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||newEntry.equipe||null,
          horaires: newEntry.horaires||null,
          prive:    newEntry.prive||false,
          finNuit:  newEntry.finNuit||false,
          impressionAt: null,
        };
        setSchedule(prev=>({...prev,[agCp+'-'+dk]:fullEntry}));
        api.planning.saveEntry(agCp, dk, fullEntry).catch(()=>{});
        if(newEntry.equipe2) {
          const tomorrow=new Date(dk);
          tomorrow.setDate(tomorrow.getDate()+1);
          const tomorrowStr=tomorrow.toISOString().slice(0,10);
          setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true}}));
        }`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - onSave complet');
} else {
    console.log('ERREUR - texte non trouve');
}
