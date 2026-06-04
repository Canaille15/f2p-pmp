const pool = require('../config/db');

// GET /api/notifications/:cp
async function getNotifications(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [rows] = await pool.query(
      `SELECT * FROM notification WHERE cp_agent=?
       ORDER BY acquittee ASC, created_at DESC`, [cp]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/notifications/:cp — créer une notification
async function createNotification(req, res) {
  const { cp } = req.params;
  const { type, titre, message, ref_id, ref_type } = req.body;
  if (!type || !titre || !message)
    return res.status(400).json({ error: 'type, titre et message requis' });
  try {
    const [result] = await pool.query(
      `INSERT INTO notification (cp_agent,type,titre,message,ref_id,ref_type)
       VALUES (?,?,?,?,?,?)`,
      [cp, type, titre, message, ref_id||null, ref_type||null]
    );
    res.status(201).json({ message: 'Notification créée', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PATCH /api/notifications/:cp/:id/acquitter
async function acquitter(req, res) {
  const { cp, id } = req.params;
  if (req.agent.cp !== cp) return res.status(403).json({ error: 'Accès refusé' });
  try {
    await pool.query(
      'UPDATE notification SET acquittee=1, acquittee_le=NOW() WHERE id=? AND cp_agent=?',
      [id, cp]);
    res.json({ message: 'Notification acquittée' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

// PATCH /api/notifications/:cp/:id/snooze
async function snooze(req, res) {
  const { cp, id } = req.params;
  const { jours } = req.body;
  if (req.agent.cp !== cp) return res.status(403).json({ error: 'Accès refusé' });
  const date = new Date();
  date.setDate(date.getDate() + (jours||10));
  try {
    await pool.query(
      'UPDATE notification SET snooze_jusqu_au=? WHERE id=? AND cp_agent=?',
      [date.toISOString().slice(0,10), id, cp]);
    res.json({ message: `Snooze ${jours||10} jours` });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getNotifications, createNotification, acquitter, snooze };
