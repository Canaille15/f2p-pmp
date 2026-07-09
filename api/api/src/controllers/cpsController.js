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

// GET /api/cps/last-import -> date/heure + auteur du dernier import (public a tous les agents connectes)
async function getLastImport(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT c.importe_le, c.importe_par, a.nom, a.prenom
       FROM planning_cps c
       LEFT JOIN agent a ON a.cp = c.importe_par
       ORDER BY c.importe_le DESC LIMIT 1`
    );
    res.json(rows[0] || null);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/cps/import  -> import en masse depuis OCR (n'importe quel agent connecte)
// body: { entries: [{cp_agent, date_jour, equipe, js_code, horaires, famille}, ...] }
// Enregistre aussi un lot d'historique (avant/apres par ligne) pour permettre
// d'annuler l'import, et purge les lots de plus de 90 jours au passage.
async function importCps(req, res) {
  const { entries } = req.body;
  if (!entries?.length) return res.status(400).json({ error: 'Entrées requises' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const details = [];
    for (const e of entries) {
      const [avantRows] = await conn.query(
        'SELECT equipe, js_code, horaires FROM planning_cps WHERE cp_agent=? AND date_jour=?',
        [e.cp_agent, e.date_jour]);
      const avant = avantRows[0] || null;
      await conn.query(
        `INSERT INTO planning_cps (cp_agent, date_jour, equipe, js_code, horaires, famille, importe_par)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE equipe=VALUES(equipe), js_code=VALUES(js_code),
           horaires=VALUES(horaires), famille=VALUES(famille),
           importe_le=NOW(), importe_par=VALUES(importe_par)`,
        [e.cp_agent, e.date_jour, e.equipe, e.js_code||null, e.horaires||null, e.famille, req.agent.cp]);
      details.push({ e, avant });
    }
    const [batchResult] = await conn.query(
      'INSERT INTO cps_import_batch (importe_par, nb_entrees) VALUES (?, ?)',
      [req.agent.cp, entries.length]);
    const batchId = batchResult.insertId;
    for (const { e, avant } of details) {
      await conn.query(
        `INSERT INTO cps_import_detail
           (batch_id, cp_agent, date_jour, famille, avant_equipe, avant_js_code, avant_horaires, apres_equipe, apres_js_code, apres_horaires)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [batchId, e.cp_agent, e.date_jour, e.famille,
         avant?.equipe||null, avant?.js_code||null, avant?.horaires||null,
         e.equipe, e.js_code||null, e.horaires||null]);
    }
    await conn.query('DELETE FROM cps_import_batch WHERE importe_le < NOW() - INTERVAL 90 DAY');
    await conn.commit();
    res.json({ message: 'Import CPS enregistré', nb: entries.length, batch_id: batchId });
  } catch (err) {
    await conn.rollback();
    console.error(err); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// GET /api/cps/history -> lots d'import des 90 derniers jours (public a tous les agents connectes)
async function getImportHistory(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT b.id, b.importe_le, b.importe_par, a.nom, a.prenom, b.nb_entrees,
              b.annule_le, b.annule_par, aa.nom AS annule_par_nom, aa.prenom AS annule_par_prenom
       FROM cps_import_batch b
       LEFT JOIN agent a  ON a.cp  = b.importe_par
       LEFT JOIN agent aa ON aa.cp = b.annule_par
       WHERE b.importe_le >= NOW() - INTERVAL 90 DAY
       ORDER BY b.importe_le DESC`
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/cps/undo-last -> annule le lot d'import le plus recent (s'il n'est pas deja annule)
// N'importe quel agent connecte peut annuler, comme pour l'import lui-meme.
async function undoLastImport(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [latestRows] = await conn.query(
      'SELECT id, annule_le FROM cps_import_batch ORDER BY importe_le DESC, id DESC LIMIT 1 FOR UPDATE');
    if (!latestRows.length) { await conn.rollback(); return res.status(400).json({ error: 'Aucun import à annuler' }); }
    const latest = latestRows[0];
    if (latest.annule_le) { await conn.rollback(); return res.status(400).json({ error: 'Le dernier import a déjà été annulé' }); }
    const [detailRows] = await conn.query('SELECT * FROM cps_import_detail WHERE batch_id = ?', [latest.id]);
    for (const d of detailRows) {
      if (d.avant_equipe === null) {
        await conn.query('DELETE FROM planning_cps WHERE cp_agent=? AND date_jour=?', [d.cp_agent, d.date_jour]);
      } else {
        await conn.query(
          'UPDATE planning_cps SET equipe=?, js_code=?, horaires=? WHERE cp_agent=? AND date_jour=?',
          [d.avant_equipe, d.avant_js_code, d.avant_horaires, d.cp_agent, d.date_jour]);
      }
    }
    await conn.query('UPDATE cps_import_batch SET annule_le=NOW(), annule_par=? WHERE id=?', [req.agent.cp, latest.id]);
    await conn.commit();
    res.json({ message: 'Import annulé', nb: detailRows.length });
  } catch (err) {
    await conn.rollback();
    console.error(err); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

module.exports = { getCps, importCps, getLastImport, getImportHistory, undoLastImport };
