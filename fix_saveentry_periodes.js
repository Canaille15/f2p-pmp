const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

// Trouver saveEntry et remplacer
const idx = c.indexOf('saveEntry: (agentId, date, entry) =>');
if (idx === -1) { console.log('ERREUR - saveEntry non trouve'); process.exit(1); }

const endIdx = c.indexOf('deleteEntry:', idx);
if (endIdx === -1) { console.log('ERREUR - fin saveEntry non trouve'); process.exit(1); }

const newSaveEntry = `saveEntry: (agentId, date, entry) => {
    const periodes = [{
      ordre: 1,
      code_equipe: entry.equipe || null,
      code_poste: (entry.jsCode && entry.jsCode.length <= 10 && !/^(M|AM|N|J|RP|RU|RQ|CA|CP|MA|VT|ABS|FOR|DISPO|NU|TC|TY|RN|JF)$/.test(entry.jsCode) && !/^(PI|PA)/.test(entry.jsCode)) ? entry.jsCode : null,
      heure_debut: entry.horaires ? entry.horaires.split('\u2013')[0]?.trim().replace('h',':') : null,
      heure_fin:   entry.horaires ? entry.horaires.split('\u2013')[1]?.trim().replace('h',':') : null,
      prive: entry.prive || false,
      note: entry.finNuit ? 'fin_nuit' : null,
    }];
    // Ajouter periode de nuit si debut de nuit ce soir
    if (entry.equipe2 === 'N') {
      periodes.push({
        ordre: 2,
        code_equipe: 'N',
        code_poste: (entry.jsCode2 && !/^(PI|PA)/.test(entry.jsCode2)) ? entry.jsCode2 : null,
        heure_debut: '22:15',
        heure_fin: '06:17',
        prive: false,
        note: 'debut_nuit',
      });
    }
    return apiFetch(\`/planning/\${agentId}/\${date}\`, {
      method: 'PUT',
      body: JSON.stringify({ periodes, source: 'manuel' }),
    });
  },
  `;

const before = c.slice(0, idx);
const after = c.slice(endIdx);
c = before + newSaveEntry + after;
fs.writeFileSync(f, c, 'utf8');
console.log('OK - saveEntry avec 2 periodes');
