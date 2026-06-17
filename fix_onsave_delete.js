const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `        setSchedule(prev=>({...prev,[agCp+'-'+dk]:fullEntry}));
        setDayPopup(null);
        // Sauvegarder en base (sequentiel pour eviter deadlock)
        try {
          await api.planning.saveEntry(agCp, dk, fullEntry);`;

const newCode = `        setDayPopup(null);
        // Si tout vide : supprimer la case
        if(!fullEntry.equipe && !fullEntry.equipe2 && !fullEntry.finNuit) {
          setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
          try { await api.planning.deleteEntry(agCp, dk); } catch(e){}
          return;
        }
        setSchedule(prev=>({...prev,[agCp+'-'+dk]:fullEntry}));
        // Sauvegarder en base (sequentiel pour eviter deadlock)
        try {
          await api.planning.saveEntry(agCp, dk, fullEntry);`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - delete si tout vide');
} else {
    console.log('ERREUR - texte non trouve');
}
