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
async function upsertPause(req, res) {
  const { cp, date } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { mois_fia, fia_done } = req.body;
  try {
    await pool.query(
      `INSERT INTO pause_figee (cp_agent, date_jour, mois_fia, fia_done)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE
         mois_fia = COALESCE(VALUES(mois_fia), mois_fia),
         fia_done = COALESCE(VALUES(fia_done), fia_done)`,
      [cp, date, mois_fia||null, fia_done!==undefined?(fia_done?1:0):null]
    );
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
