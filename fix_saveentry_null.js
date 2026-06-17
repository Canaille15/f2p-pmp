const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

// Trouver saveEntry et corriger : si equipe null et equipe2=N, envoyer N comme periode 1
const idx = c.indexOf('saveEntry: (agentId, date, entry) => {');
if (idx === -1) { console.log('ERREUR'); process.exit(1); }

// Trouver la ligne periodes
const periodeIdx = c.indexOf('const periodes = [{', idx);
const periodeEnd = c.indexOf('}];', periodeIdx) + 3;

const oldPeriode = c.slice(periodeIdx, periodeEnd);
console.log('Periodes actuelles:', oldPeriode.slice(0, 100));

const newPeriode = `const periodes = [];
    // Periode 1 : journee (si equipe non null)
    if (entry.equipe) {
      periodes.push({
        ordre: 1,
        code_equipe: entry.equipe,
        code_poste: (entry.jsCode && entry.jsCode.length <= 10 && !/^(M|AM|N|J|RP|RU|RQ|CA|CP|MA|VT|ABS|FOR|DISPO|NU|TC|TY|RN|JF)$/.test(entry.jsCode) && !/^(PI|PA)/.test(entry.jsCode)) ? entry.jsCode : null,
        heure_debut: entry.horaires ? entry.horaires.split('\u2013')[0]?.trim().replace('h',':') : null,
        heure_fin:   entry.horaires ? entry.horaires.split('\u2013')[1]?.trim().replace('h',':') : null,
        prive: entry.prive || false,
        note: entry.finNuit ? 'fin_nuit' : null,
      });
    }
    // Periode nuit ce soir (si equipe2=N)
    if (entry.equipe2 === 'N') {
      periodes.push({
        ordre: periodes.length + 1,
        code_equipe: 'N',
        code_poste: (entry.jsCode2 && !/^(PI|PA)/.test(entry.jsCode2)) ? entry.jsCode2 : null,
        heure_debut: '22:15',
        heure_fin: '06:17',
        prive: false,
        note: 'debut_nuit',
      });
    }
    // Si rien du tout mais finNuit : juste noter la fin de nuit
    if (periodes.length === 0 && entry.finNuit) {
      periodes.push({
        ordre: 1,
        code_equipe: 'N',
        code_poste: entry.jsCode || null,
        heure_debut: null,
        heure_fin: null,
        prive: false,
        note: 'fin_nuit',
      });
    }
    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:null});`;

c = c.slice(0, periodeIdx) + newPeriode + c.slice(periodeEnd);
fs.writeFileSync(f, c, 'utf8');
console.log('OK - saveEntry corrige');
