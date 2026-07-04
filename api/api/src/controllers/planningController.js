const pool = require('../config/db');
const CODES_PUBLICS = new Set(['M','AM','N','J','JF','FOR','DISPO']);

async function getPlanning(req, res) {
  const { cp } = req.params;
  const { from, to } = req.query;
  const isSelf = req.agent.cp === cp;
  const isAdmin = req.agent.is_admin;
  try {
    const [rows] = await pool.query(
      `SELECT pj.id, pj.date_jour, pj.source,
              pp.ordre, pp.code_equipe, pp.code_poste,
              pp.heure_debut, pp.heure_fin, pp.prive, pp.note, pp.note_perso
       FROM planning_jour pj
       JOIN planning_periode pp ON pp.planning_jour_id = pj.id
       WHERE pj.cp_agent = ?
         AND (? IS NULL OR pj.date_jour >= ?)
         AND (? IS NULL OR pj.date_jour <= ?)
         AND (pp.prive = 0 OR ? OR ?)
       ORDER BY pj.date_jour, pp.ordre`,
      [cp, from||null, from||null, to||null, to||null, isSelf?1:0, isAdmin?1:0]);
    // note_perso est une donnee strictement personnelle : jamais renvoyee
    // a quelqu'un d'autre que le titulaire du planning, meme un admin,
    // meme sur une ligne publique (M/AM/N/J...). Filtrage fait ici en JS
    // plutot qu'en SQL pour eviter tout comportement incertain d'un
    // parametre lie a l'interieur d'un CASE WHEN selon le driver/version.
    if (!isSelf) {
      for (const row of rows) row.note_perso = null;
    }
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function setJour(req, res) {
  const { cp, date } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { periodes, source } = req.body;
  if (!periodes?.length) return res.status(400).json({ error: 'Périodes requises' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO planning_jour (cp_agent, date_jour, source) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE source=VALUES(source), modifie_le=NOW()`,
      [cp, date, source||'manuel']);
    const [[jour]] = await conn.query(
      'SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp, date]);
    await conn.query('DELETE FROM planning_periode WHERE planning_jour_id=?', [jour.id]);
    for (const p of periodes) {
      const prive = p.prive !== undefined ? (p.prive?1:0) : (CODES_PUBLICS.has(p.code_equipe)?0:1);
      await conn.query(
        `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [jour.id, p.ordre||1, p.code_equipe||(p.note==='fin_nuit'?'N':null), p.code_poste||null,
         p.heure_debut||null, p.heure_fin||null, prive, p.note||null, p.note_perso||null]);
    }
    await conn.commit();
    res.json({ message: 'Journée enregistrée', id: jour.id });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

async function deleteJour(req, res) {
  const { cp, date } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    await pool.query('DELETE FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp, date]);
    res.json({ message: 'Journée supprimée' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

// GET /api/planning/public?from=&to=  -> planning PUBLIC de TOUS les agents (pour planning previsionnel partage)
async function getAllPublic(req, res) {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT pj.cp_agent, pj.date_jour, pj.source,
              pp.ordre, pp.code_equipe, pp.code_poste,
              pp.heure_debut, pp.heure_fin, pp.note
       FROM planning_jour pj
       JOIN planning_periode pp ON pp.planning_jour_id = pj.id
       JOIN agent a ON a.cp = pj.cp_agent
       WHERE pp.prive = 0
         AND a.partage_previsionnel = 1
         AND (? IS NULL OR pj.date_jour >= ?)
         AND (? IS NULL OR pj.date_jour <= ?)
       ORDER BY pj.date_jour, pj.cp_agent, pp.ordre`,
      [from||null, from||null, to||null, to||null]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getPlanning, getAllPublic, setJour, deleteJour };
