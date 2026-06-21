const pool = require('../config/db');

// GET /api/cps-aleas?from=&to=  -> tous les aleas sur une periode (lecture publique a tous)
async function getAleas(req, res) {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT id, js_code, date_jour, famille, type, agents_concernes, motif, signale_par, signale_le
       FROM cps_aleas
       WHERE (? IS NULL OR date_jour >= ?)
         AND (? IS NULL OR date_jour <= ?)
       ORDER BY date_jour, js_code`,
      [from||null, from||null, to||null, to||null]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/cps-aleas  -> creer un alea (tous les agents connectes peuvent signaler)
// body: { js_code, date_jour, famille, type, agents_concernes: [cp1, cp2...], motif }
async function createAlea(req, res) {
  const { js_code, date_jour, famille, type, agents_concernes, motif } = req.body;
  if (!js_code || !date_jour || !famille || !type) {
    return res.status(400).json({ error: 'js_code, date_jour, famille et type sont requis' });
  }
  if (!['echange','erreur_cps','non_tenu'].includes(type)) {
    return res.status(400).json({ error: 'Type invalide' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO cps_aleas (js_code, date_jour, famille, type, agents_concernes, motif, signale_par)
       VALUES (?,?,?,?,?,?,?)`,
      [js_code, date_jour, famille, type,
       agents_concernes ? JSON.stringify(agents_concernes) : null,
       motif || null, req.agent.cp]);
    res.status(201).json({ message: 'Aléa signalé', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// DELETE /api/cps-aleas/:id  -> retirer un alea (annule le signalement, retour a l'officiel)
async function deleteAlea(req, res) {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM cps_aleas WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Aléa introuvable' });
    res.json({ message: 'Aléa supprimé' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getAleas, createAlea, deleteAlea };
