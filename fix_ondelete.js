const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `      onDelete={async ()=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const entry = schedule[agCp+'-'+dk] || {};
        const hadNuit = !!entry.equipe2;
        // Supprimer localement
        setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
        setDayPopup(null);
        // Supprimer en base
        try {
          await api.planning.deleteEntry(agCp, dk);
          // Si avait une nuit : retirer finNuit du lendemain
          if(hadNuit) {
            const tomorrow=new Date(dk+'T12:00:00');
            tomorrow.setDate(tomorrow.getDate()+1);
            const tomorrowStr=tomorrow.toISOString().slice(0,10);
            const prevTomorrow = schedule[agCp+'-'+tomorrowStr] || {};
            if(prevTomorrow.finNuit) {
              const newTomorrow = {...prevTomorrow, finNuit:false};
              // Si la case lendemain n'a plus rien d'autre, la supprimer
              if(!newTomorrow.equipe) {
                setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+tomorrowStr];return n;});
                await api.planning.deleteEntry(agCp, tomorrowStr);
              } else {
                setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:newTomorrow}));
                await api.planning.saveEntry(agCp, tomorrowStr, newTomorrow);
              }
            }
          }
        } catch(e) { console.error('Erreur delete:', e); }
      }}`;

const newCode = `      onDelete={async (type)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const entry = schedule[agCp+'-'+dk] || {};
        setDayPopup(null);

        const cleanTomorrow = async () => {
          const tomorrow=new Date(dk+'T12:00:00');
          tomorrow.setDate(tomorrow.getDate()+1);
          const tomorrowStr=tomorrow.toISOString().slice(0,10);
          const prevTomorrow = schedule[agCp+'-'+tomorrowStr] || {};
          if(prevTomorrow.finNuit) {
            const newTomorrow = {...prevTomorrow, finNuit:false, equipe2:null};
            if(!newTomorrow.equipe && !newTomorrow.equipe2) {
              setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+tomorrowStr];return n;});
              await api.planning.deleteEntry(agCp, tomorrowStr);
            } else {
              setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:newTomorrow}));
              await api.planning.saveEntry(agCp, tomorrowStr, newTomorrow);
            }
          }
        };

        try {
          if(type==='journee') {
            // Garder la nuit, effacer juste la journée
            const newEntry = {...entry, equipe:null, jsCode:null, horaires:null};
            setSchedule(prev=>({...prev,[agCp+'-'+dk]:newEntry}));
            await api.planning.saveEntry(agCp, dk, newEntry);
          } else if(type==='nuit') {
            // Effacer la nuit + nettoyer le lendemain
            const newEntry = {...entry, equipe2:null, jsCode2:null};
            if(!newEntry.equipe && !newEntry.finNuit) {
              setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
              await api.planning.deleteEntry(agCp, dk);
            } else {
              setSchedule(prev=>({...prev,[agCp+'-'+dk]:newEntry}));
              await api.planning.saveEntry(agCp, dk, newEntry);
            }
            await cleanTomorrow();
          } else {
            // Effacer tout
            setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
            await api.planning.deleteEntry(agCp, dk);
            if(entry.equipe2) await cleanTomorrow();
          }
        } catch(e) { console.error('Erreur delete:', e); }
      }}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - onDelete 3 types');
} else {
    console.log('ERREUR - onDelete non trouve');
}
