const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

const old = 'periodes: [{ordre:1,code_equipe:entry.equipe||null,code_poste:null,prive:entry.prive||false}],source:\'manuel\',';
const newCode = `periodes: [{
          ordre: 1,
          code_equipe: entry.equipe||null,
          code_poste:  entry.jsCode&&!["M","AM","N","J","RP","RU","RQ","CA","CP","MA","VT","ABS","FOR","DISPO","NU","TC","TY","RN","JF"].includes(entry.jsCode) ? entry.jsCode : null,
          heure_debut: entry.horaires ? entry.horaires.split('–')[0]?.trim().replace('h',':') : null,
          heure_fin:   entry.horaires ? entry.horaires.split('–')[1]?.trim().replace('h',':') : null,
          prive:       entry.prive||false,
          note:        entry.finNuit ? 'fin_nuit' : null,
        }],source:'manuel',`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - saveEntry avec jsCode et horaires');
} else {
    console.log('ERREUR - texte non trouve');
}
