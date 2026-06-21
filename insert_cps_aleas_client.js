const fs = require('fs');
let c = fs.readFileSync('src/api/client.js', 'utf8');

const idx2 = c.indexOf('\nconst ', c.indexOf('const cps =') + 20);

if (idx2 === -1) {
  console.log('ERREUR - marqueur non trouve');
  process.exit(1);
}

const insertion = `
// ─── ALEAS CPS (echanges, erreurs, postes non tenus) ───────────────────────
const cpsAleas = {
  /**
   * Charger tous les aleas sur une periode
   */
  async getAll(from, to) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const rows = await apiFetch(\`/cps-aleas?\${params.toString()}\`);
    return rows || [];
  },
  /**
   * Signaler un alea (echange, erreur_cps, ou non_tenu)
   * @param {object} data { js_code, date_jour, famille, type, agents_concernes, motif }
   */
  async create(data) {
    return apiFetch('/cps-aleas', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  /**
   * Retirer un alea (retour a l'affichage officiel)
   */
  async remove(id) {
    return apiFetch(\`/cps-aleas/\${id}\`, { method: 'DELETE' });
  },
};
`;

c = c.slice(0, idx2) + insertion + c.slice(idx2);
fs.writeFileSync('src/api/client.js', c, 'utf8');
console.log('OK - module cpsAleas insere');
