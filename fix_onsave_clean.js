const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `      onSave={(newEntry)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const prevEntry = schedule[agCp+'-'+dk] || {};
        const fullEntry={
          equipe:   newEntry.equipe !== undefined ? (newEntry.equipe||null) : (prevEntry.equipe||null),
          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||null,
          jsCode2:  newEntry.jsCodeNuit||null,
          horaires: newEntry.horaires||null,
          prive:    newEntry.prive||false,
          finNuit:  newEntry.finNuit||false,
          impressionAt: null,
        };
        setSchedule(prev=>({...prev,[agCp+'-'+dk]:fullEntry}));
        api.planning.saveEntry(agCp, dk, fullEntry).then(()=>{
          if(newEntry.equipe2) {
            const tomorrow=new Date(dk);
            tomorrow.setDate(tomorrow.getDate()+1);
            const tomorrowStr=tomorrow.toISOString().slice(0,10);
            setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:{...(prev[agCp+'-'+tomorrowStr]||{}),finNuit:true,equipe:'N',jsCode:newEntry.jsCodeNuit||null}}));
            setTimeout(()=>api.planning.saveEntry(agCp, tomorrowStr, {equipe:'N', jsCode:newEntry.jsCodeNuit||null, horaires:'22h15\u201306h17', finNuit:true, prive:false}).catch(()=>{}), 300);
          }
        }).catch(()=>{});
        if(newEntry.equipe2_placeholder) {
        }
        setDayPopup(null);
      }}
      onDelete={()=>{ setDay(dayPopup.dk,null); setDayPopup(null); }}`;

const newCode = `      onSave={async (newEntry)=>{
        const agCp=agent.immatriculation||agent.cp||agent.id;
        const dk=dayPopup.dk;
        const prevEntry = schedule[agCp+'-'+dk] || {};
        // Garder finNuit existant si pas modifie
        const fullEntry={
          equipe:   newEntry.equipe !== undefined ? (newEntry.equipe||null) : (prevEntry.equipe||null),
          equipe2:  newEntry.equipe2||null,
          jsCode:   newEntry.jsCode||null,
          jsCode2:  newEntry.jsCodeNuit||null,
          horaires: newEntry.horaires||null,
          prive:    newEntry.prive||false,
          finNuit:  newEntry.finNuit !== undefined ? newEntry.finNuit : (prevEntry.finNuit||false),
          impressionAt: null,
        };
        // Sauvegarder localement
        setSchedule(prev=>({...prev,[agCp+'-'+dk]:fullEntry}));
        setDayPopup(null);
        // Sauvegarder en base (sequentiel pour eviter deadlock)
        try {
          await api.planning.saveEntry(agCp, dk, fullEntry);
          // Si debut de nuit : propager fin nuit sur J+1
          if(newEntry.equipe2) {
            const tomorrow=new Date(dk+'T12:00:00');
            tomorrow.setDate(tomorrow.getDate()+1);
            const tomorrowStr=tomorrow.toISOString().slice(0,10);
            const prevTomorrow = schedule[agCp+'-'+tomorrowStr] || {};
            const tomorrowEntry = {
              ...prevTomorrow,
              finNuit: true,
              equipe: prevTomorrow.equipe || null,
              jsCode: prevTomorrow.jsCode || null,
            };
            setSchedule(prev=>({...prev,[agCp+'-'+tomorrowStr]:tomorrowEntry}));
            await api.planning.saveEntry(agCp, tomorrowStr, {
              equipe: tomorrowEntry.equipe || null,
              jsCode: tomorrowEntry.jsCode || null,
              horaires: tomorrowEntry.horaires || null,
              finNuit: true,
              prive: tomorrowEntry.prive || false,
            });
          }
        } catch(e) { console.error('Erreur save:', e); }
      }}
      onDelete={async ()=>{
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

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - onSave et onDelete propres');
} else {
    console.log('ERREUR - texte non trouve');
}
