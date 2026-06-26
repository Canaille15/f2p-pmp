const pool = require('../config/db');

async function getAll(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, cp_agent, date_jour, message, modifie_par, modifie_le
       FROM journee_speciale_notes
       ORDER BY date_jour DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function upsert(req, res) {
  const { cp_agent, date_jour, message } = req.body;
  if (!cp_agent || !date_jour || !message || !message.trim()) {
    return res.status(400).json({ error: 'cp_agent, date_jour et message sont requis' });
  }
  const modifie_par = req.agent?.cp || null;
  try {
    await pool.query(
      `INSERT INTO journee_speciale_notes (cp_agent, date_jour, message, modifie_par)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE message = VALUES(message), modifie_par = VALUES(modifie_par)`,
      [cp_agent, date_jour, message.trim(), modifie_par]
    );
    res.json({ message: 'Note enregistree' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM journee_speciale_notes WHERE id = ?', [id]);
    res.json({ message: 'Note supprimee' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getAll, upsert, remove };
