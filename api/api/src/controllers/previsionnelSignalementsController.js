const pool = require('../config/db');

// ─── GET ALL (avec filtrage resolution automatique) ─────────────────────────
async function getAll(req, res) {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.agent_titulaire_cp, s.date_jour, s.equipe_origine,
              s.agents_remplacants, s.motif, s.signale_par, s.signale_le,
              pp.code_equipe AS equipe_actuelle
       FROM previsionnel_signalements s
       LEFT JOIN planning_jour pj ON pj.cp_agent = s.agent_titulaire_cp AND pj.date_jour = s.date_jour
       LEFT JOIN planning_periode pp ON pp.planning_jour_id = pj.id AND pp.ordre = 1
       WHERE (? IS NULL OR s.date_jour >= ?)
         AND (? IS NULL OR s.date_jour <= ?)
       ORDER BY s.date_jour, s.signale_le DESC`,
      [from||null, from||null, to||null, to||null]);

    // Resolution automatique : on ne garde que les signalements
    // dont l'equipe actuelle du titulaire correspond encore a l'equipe au moment du signalement
    const actifs = rows.filter(r => r.equipe_actuelle !== null && r.equipe_actuelle === r.equipe_origine);

    const result = actifs.map(r => ({
      id: r.id,
      agent_titulaire_cp: r.agent_titulaire_cp,
      date_jour: r.date_jour,
      agents_remplacants: typeof r.agents_remplacants === 'string' ? JSON.parse(r.agents_remplacants) : r.agents_remplacants,
      motif: r.motif,
      signale_par: r.signale_par,
      signale_le: r.signale_le,
    }));

    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// ─── CREATE ───────────────────────────────────────────────────────────────
async function create(req, res) {
  const { agent_titulaire_cp, date_jour, agents_remplacants, motif } = req.body;

  if (!agent_titulaire_cp || !date_jour || !Array.isArray(agents_remplacants) || !agents_remplacants.length) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  if (agents_remplacants.length > 4) {
    return res.status(400).json({ error: 'Maximum 4 agents remplacants' });
  }

  try {
    // Capturer l'equipe actuelle du titulaire pour ce jour (snapshot pour resolution automatique)
    const [snap] = await pool.query(
      `SELECT pp.code_equipe
       FROM planning_jour pj
       JOIN planning_periode pp ON pp.planning_jour_id = pj.id AND pp.ordre = 1
       WHERE pj.cp_agent = ? AND pj.date_jour = ?`,
      [agent_titulaire_cp, date_jour]);

    if (!snap.length) {
      return res.status(400).json({ error: 'Le titulaire n\'a pas de planning publie ce jour-la' });
    }
    const equipe_origine = snap[0].code_equipe;

    const [result] = await pool.query(
      `INSERT INTO previsionnel_signalements
         (agent_titulaire_cp, date_jour, equipe_origine, agents_remplacants, motif, signale_par)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [agent_titulaire_cp, date_jour, equipe_origine, JSON.stringify(agents_remplacants), motif||null, req.agent.cp]);

    res.status(201).json({ id: result.insertId, message: 'Signalement cree' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// ─── REMOVE (annulation manuelle) ────────────────────────────────────────
async function remove(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT signale_par FROM previsionnel_signalements WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Signalement introuvable' });
    if (rows[0].signale_par !== req.agent.cp && !req.agent.is_admin) {
      return res.status(403).json({ error: 'Acces refuse' });
    }
    await pool.query('DELETE FROM previsionnel_signalements WHERE id = ?', [id]);
    res.json({ message: 'Signalement supprime' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getAll, create, remove };
