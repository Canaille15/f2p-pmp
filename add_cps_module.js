const fs = require('fs');
let c = fs.readFileSync('src/api/client.js', 'utf8');

const marker = '// ─── MODULE CONGÉS ────────────────────────────────────────────────────────────';

const cpsModule = `// ─── MODULE CPS (planning officiel SNCF importé) ──────────────────────────────

export const cps = {
  /**
   * Charger tout le planning CPS sur une période
   * Retourne un objet { "AGENTID-YYYY-MM-DD": { equipe, jsCode, horaires, famille } }
   */
  async getSchedule(from, to) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const rows = await apiFetch(\`/cps?\${params.toString()}\`);
    if (!rows) return {};
    const result = {};
    rows.forEach((row) => {
      const date = row.date_jour ? row.date_jour.split('T')[0] : row.date;
      result[\`\${row.cp_agent}-\${date}\`] = {
        equipe: row.equipe || null,
        jsCode: row.js_code || null,
        horaires: row.horaires || null,
        famille: row.famille || null,
        prive: false,
      };
    });
    return result;
  },

  /**
   * Importer en masse des entrées CPS (admin uniquement)
   * @param {Array<{cp_agent, date_jour, equipe, js_code, horaires, famille}>} entries
   */
  import: (entries) =>
    apiFetch('/cps/import', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),
};

${marker}`;

if (c.includes(marker)) {
  c = c.replace(marker, cpsModule);
  fs.writeFileSync('src/api/client.js', c, 'utf8');
  console.log('OK - module cps ajoute dans client.js');
} else {
  console.log('ERREUR - marqueur non trouve');
}

// Ajouter aussi 'cps' dans l'export principal
let c2 = fs.readFileSync('src/api/client.js', 'utf8');
const exportOld = `const api = {
  auth,
  agents,
  planning,
  profil,
  conges,
  notifications,
  echanges,
  pauses,
  fetes,
};`;
const exportNew = `const api = {
  auth,
  agents,
  planning,
  profil,
  conges,
  notifications,
  echanges,
  pauses,
  fetes,
  cps,
};`;
if (c2.includes(exportOld)) {
  c2 = c2.replace(exportOld, exportNew);
  fs.writeFileSync('src/api/client.js', c2, 'utf8');
  console.log('OK - cps ajoute a export principal');
} else {
  console.log('ERREUR - export principal non trouve');
}
