const fs = require('fs');
const f = 'src/api/client.js';
let c = fs.readFileSync(f, 'utf8');

// Trouver getSchedule par position
const startMarker = 'async getSchedule(agentId) {';
const endMarker = '  },\n  /**\n   * Charger le planning de TOUS';

const startIdx = c.indexOf(startMarker);
const endIdx = c.indexOf(endMarker);

if (startIdx === -1) { console.log('ERREUR start'); process.exit(1); }
if (endIdx === -1) { 
    // Chercher autre fin possible
    const endMarker2 = '  async getAllSchedules';
    const endIdx2 = c.indexOf(endMarker2);
    if (endIdx2 === -1) { console.log('ERREUR end'); process.exit(1); }
    console.log('Fin trouvee via getAllSchedules');
    
    const newGetSchedule = `async getSchedule(agentId) {
    const rows = await apiFetch(\`/planning/\${agentId}\`);
    if (!rows) return {};
    // Grouper par date (plusieurs periodes par jour)
    const byDate = {};
    rows.forEach((row) => {
      const date = row.date_jour ? row.date_jour.split('T')[0] : row.date;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(row);
    });
    const result = {};
    Object.entries(byDate).forEach(([date, periodes]) => {
      const p1 = periodes.find(p => p.note !== 'debut_nuit') || periodes[0];
      const p2 = periodes.find(p => p.note === 'debut_nuit');
      const horaires = p1.heure_debut ? (p1.heure_debut.slice(0,5).replace(':','h')+'\u2013'+(p1.heure_fin||'').slice(0,5).replace(':','h')) : null;
      result[\`\${agentId}-\${date}\`] = {
        equipe:   p1.code_equipe || null,
        equipe2:  p2 ? 'N' : null,
        jsCode:   p1.code_poste  || null,
        jsCode2:  p2 ? (p2.code_poste || null) : null,
        horaires: horaires,
        prive:    !!p1.prive,
        finNuit:  p1.note === 'fin_nuit',
        impressionAt: null,
      };
    });
    return result;
  },\n\n  `;
    
    const before = c.slice(0, startIdx);
    const after = c.slice(endIdx2);
    c = before + newGetSchedule + after;
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - getSchedule v2');
}
