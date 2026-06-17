const pool = require('../config/db');

// GET /api/cps?from=&to=  -> tout le planning CPS sur une periode (lecture publique a tous)
async function getCps(req, res) {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT cp_agent, date_jour, equipe, js_code, horaires, famille
       FROM planning_cps
       WHERE (? IS NULL OR date_jour >= ?)
         AND (? IS NULL OR date_jour <= ?)
       ORDER BY date_jour, cp_agent`,
      [from||null, from||null, to||null, to||null]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/cps/import  -> import en masse depuis OCR (admin uniquement)
// body: { entries: [{cp_agent, date_jour, equipe, js_code, horaires, famille}, ...] }
async function importCps(req, res) {
  if (!req.agent.is_admin) return res.status(403).json({ error: 'Accès refusé' });
  const { entries } = req.body;
  if (!entries?.length) return res.status(400).json({ error: 'Entrées requises' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const e of entries) {
      await conn.query(
        `INSERT INTO planning_cps (cp_agent, date_jour, equipe, js_code, horaires, famille, importe_par)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE equipe=VALUES(equipe), js_code=VALUES(js_code),
           horaires=VALUES(horaires), famille=VALUES(famille),
           importe_le=NOW(), importe_par=VALUES(importe_par)`,
        [e.cp_agent, e.date_jour, e.equipe, e.js_code||null, e.horaires||null, e.famille, req.agent.cp]);
    }
    await conn.commit();
    res.json({ message: 'Import CPS enregistré', nb: entries.length });
  } catch (err) {
    await conn.rollback();
    console.error(err); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

module.exports = { getCps, importCps };
