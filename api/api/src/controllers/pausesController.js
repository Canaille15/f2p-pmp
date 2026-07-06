const pool = require('../config/db');

// GET /api/pauses/:cp
async function getPauses(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [rows] = await pool.query(
      'SELECT * FROM pause_figee WHERE cp_agent=? ORDER BY date_jour', [cp]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

// PUT /api/pauses/:cp/:date — ajouter ou mettre à jour une pause
// Distingue explicitement "champ non envoyé" (on n'y touche pas) de "champ
// envoyé à null" (on l'efface réellement) — l'ancienne version utilisait un
// COALESCE qui empêchait de jamais remettre mois_fia à NULL une fois rempli :
// COALESCE(NULL, valeur_existante) renvoie toujours valeur_existante, donc un
// "effacement" envoyé au serveur ne faisait jamais rien.
async function upsertPause(req, res) {
  const { cp, date } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { mois_fia, fia_done } = req.body;
  try {
    // Garantit l'existence de la ligne sans toucher à une valeur existante
    await pool.query(
      `INSERT INTO pause_figee (cp_agent, date_jour) VALUES (?,?)
       ON DUPLICATE KEY UPDATE cp_agent = cp_agent`,
      [cp, date]
    );
    const fields = [], values = [];
    if (mois_fia !== undefined) { fields.push('mois_fia = ?'); values.push(mois_fia || null); }
    if (fia_done !== undefined) { fields.push('fia_done = ?'); values.push(fia_done ? 1 : 0); }
    if (fields.length) {
      values.push(cp, date);
      await pool.query(
        `UPDATE pause_figee SET ${fields.join(', ')} WHERE cp_agent=? AND date_jour=?`,
        values
      );
    }
    res.json({ message: 'Pause enregistrée' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// DELETE /api/pauses/:cp/:date
async function deletePause(req, res) {
  const { cp, date } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    await pool.query('DELETE FROM pause_figee WHERE cp_agent=? AND date_jour=?', [cp, date]);
    res.json({ message: 'Pause supprimée' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getPauses, upsertPause, deletePause };
