const pool = require('../config/db');
const { detecterEtAutoSignalerNonTenu, PAUSEUR_FAMILLE } = require('../utils/pauseFigeeAuto');

// GET /api/cps?from=&to=  -> tout le planning CPS sur une periode (lecture publique a tous)
async function getCps(req, res) {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT cp_agent, date_jour, equipe, js_code, horaires, famille, en_formation
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
// body: { entries: [{cp_agent, date_jour, equipe, js_code, horaires, famille, en_formation}, ...],
//          clears: [{cp_agent, date_jour}, ...] }
// `clears` (09/09) : postes redevenus vacants sur le document reimporte -- le
// frontend a detecte que l'agent precedemment affecte a ce poste n'apparait
// plus du tout sur la feuille (aucune ligne pour lui ce jour-la), sa case doit
// donc etre videe explicitement. Sans ca, un simple upsert par (cp_agent,
// date_jour) ne touche jamais un agent absent des nouvelles entrees -- sa
// vieille affectation restait figee en base indefiniment malgre un reimport
// confirme (cas reel : Pastant reste sur PAAC2- le 9 alors que la vraie feuille
// montre ce poste vide). Chaque suppression est journalisee dans
// cps_import_detail (avant_* = derniere valeur connue) exactement comme une
// ligne normale, pour rester annulable via le meme mecanisme "↩️ Annuler".
// Enregistre aussi un lot d'historique (avant/apres par ligne) pour permettre
// d'annuler l'import, et purge les lots de plus de 90 jours au passage.
async function importCps(req, res) {
  const { entries, clears } = req.body;
  const clearsList = Array.isArray(clears) ? clears : [];
  if (!entries?.length && !clearsList.length) return res.status(400).json({ error: 'Entrées requises' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const details = [];
    for (const e of (entries || [])) {
      const [avantRows] = await conn.query(
        'SELECT equipe, js_code, horaires, en_formation FROM planning_cps WHERE cp_agent=? AND date_jour=?',
        [e.cp_agent, e.date_jour]);
      const avant = avantRows[0] || null;
      const enFormation = e.en_formation ? 1 : 0;
      await conn.query(
        `INSERT INTO planning_cps (cp_agent, date_jour, equipe, js_code, horaires, famille, en_formation, importe_par)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE equipe=VALUES(equipe), js_code=VALUES(js_code),
           horaires=VALUES(horaires), famille=VALUES(famille), en_formation=VALUES(en_formation),
           importe_le=NOW(), importe_par=VALUES(importe_par)`,
        [e.cp_agent, e.date_jour, e.equipe, e.js_code||null, e.horaires||null, e.famille, enFormation, req.agent.cp]);
      details.push({ cp_agent: e.cp_agent, date_jour: e.date_jour, famille: e.famille, avant,
        apres: { equipe: e.equipe, js_code: e.js_code||null, horaires: e.horaires||null, en_formation: enFormation } });
    }
    for (const c of clearsList) {
      const [avantRows] = await conn.query(
        'SELECT equipe, js_code, horaires, famille, en_formation FROM planning_cps WHERE cp_agent=? AND date_jour=?',
        [c.cp_agent, c.date_jour]);
      const avant = avantRows[0] || null;
      if (!avant) continue; // deja vide, rien a faire ni a journaliser
      await conn.query('DELETE FROM planning_cps WHERE cp_agent=? AND date_jour=?', [c.cp_agent, c.date_jour]);
      details.push({ cp_agent: c.cp_agent, date_jour: c.date_jour, famille: avant.famille, avant, apres: null });
    }
    const [batchResult] = await conn.query(
      'INSERT INTO cps_import_batch (importe_par, nb_entrees) VALUES (?, ?)',
      [req.agent.cp, details.length]);
    const batchId = batchResult.insertId;
    for (const { cp_agent, date_jour, famille, avant, apres } of details) {
      // apres_equipe et apres_en_formation sont NOT NULL en base (schema verifie
      // 09/09) -- une ligne "clear" (apres===null, poste vide) doit donc leur
      // donner une vraie valeur ('' / 0) plutot que null, contrairement a
      // avant_* et apres_js_code/apres_horaires qui restent nullable.
      await conn.query(
        `INSERT INTO cps_import_detail
           (batch_id, cp_agent, date_jour, famille, avant_equipe, avant_js_code, avant_horaires, avant_en_formation, apres_equipe, apres_js_code, apres_horaires, apres_en_formation)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [batchId, cp_agent, date_jour, famille,
         avant?.equipe||null, avant?.js_code||null, avant?.horaires||null, avant?avant.en_formation:null,
         apres?apres.equipe:'', apres?.js_code||null, apres?.horaires||null, apres?apres.en_formation:0]);
    }
    await conn.query('DELETE FROM cps_import_batch WHERE importe_le < NOW() - INTERVAL 90 DAY');
    // 12/09 -- auto-activation "poste non tenu" (Pauseur) si la case reste
    // vide sur la feuille importee : pour chaque date touchee par ce batch
    // (entries + clears), verifie les 4 postes Pauseur. Dans la meme
    // transaction que l'import lui-meme (atomique -- si quelque chose
    // echoue, tout l'import est annule comme avant, aucun etat partiel).
    const datesTouchees = new Set([
      ...(entries || []).map(e => e.date_jour),
      ...clearsList.map(c => c.date_jour),
    ]);
    for (const date_jour of datesTouchees) {
      for (const js_code of Object.keys(PAUSEUR_FAMILLE)) {
        await detecterEtAutoSignalerNonTenu(conn, { js_code, date_jour, signalePar: req.agent.cp });
      }
    }
    await conn.commit();
    res.json({ message: 'Import CPS enregistré', nb: entries?.length||0, nb_clears: clearsList.length, batch_id: batchId });
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
        // 09/09 : INSERT...ON DUPLICATE KEY UPDATE plutot qu'un simple UPDATE --
        // une ligne "clear" (nouvelle fonctionnalite du 09/09) a pu supprimer la
        // ligne entre l'import et l'annulation ; un UPDATE seul n'aurait alors
        // affecte aucune ligne (echec silencieux). Cette forme restaure la
        // donnee que la ligne existe encore (mise a jour) ou plus (recreation).
        await conn.query(
          `INSERT INTO planning_cps (cp_agent, date_jour, equipe, js_code, horaires, famille, en_formation, importe_par)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE equipe=VALUES(equipe), js_code=VALUES(js_code),
             horaires=VALUES(horaires), en_formation=VALUES(en_formation)`,
          [d.cp_agent, d.date_jour, d.avant_equipe, d.avant_js_code, d.avant_horaires, d.famille, d.avant_en_formation||0, req.agent.cp]);
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
