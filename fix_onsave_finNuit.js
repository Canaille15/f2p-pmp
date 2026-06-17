const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `        // Si tout vide : supprimer la case
        if(!fullEntry.equipe && !fullEntry.equipe2 && !fullEntry.finNuit) {
          setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
          try { await api.planning.deleteEntry(agCp, dk); } catch(e){}
          return;
        }`;

const newCode = `        // Si tout vide (pas d'equipe, pas de nuit, pas de finNuit) : supprimer la case
        const hasContent = !!(fullEntry.equipe || fullEntry.equipe2 || fullEntry.finNuit);
        if(!hasContent) {
          setSchedule(prev=>{const n={...prev};delete n[agCp+'-'+dk];return n;});
          try { await api.planning.deleteEntry(agCp, dk); } catch(e){}
          return;
        }`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - finNuit sauvegarde');
} else {
    console.log('ERREUR');
}
