const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

const old = `      result[\`\${agentId}-\${date}\`] = {
        equipe:   p1.code_equipe || null,
        equipe2:  p2 ? 'N' : null,
        jsCode:   p1.code_poste  || null,
        jsCode2:  p2 ? (p2.code_poste || null) : null,
        horaires: horaires,
        prive:    !!p1.prive,
        finNuit:  p1.note === 'fin_nuit',
        impressionAt: null,
      };`;

const newCode = `      const isFinNuit = p1.note === 'fin_nuit';
      result[\`\${agentId}-\${date}\`] = {
        // Si fin_nuit seule : equipe=null, finNuit=true
        equipe:   isFinNuit && !p2 ? null : (p1.code_equipe || null),
        equipe2:  p2 ? 'N' : null,
        jsCode:   isFinNuit && !p2 ? null : (p1.code_poste || null),
        jsCode2:  p2 ? (p2.code_poste || null) : null,
        horaires: isFinNuit ? null : horaires,
        prive:    !!p1.prive,
        finNuit:  isFinNuit,
        impressionAt: null,
      };`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - fin_nuit mappé correctement');
} else {
    console.log('ERREUR');
}
