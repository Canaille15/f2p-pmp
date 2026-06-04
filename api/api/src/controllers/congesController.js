const pool = require('../config/db');

// GET /api/conges/:cp?annee=2026
async function getConges(req, res) {
  const { cp } = req.params;
  const { annee } = req.query;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [demandes] = await pool.query(
      `SELECT * FROM conge_demande WHERE cp_agent=? ${annee?'AND annee=?':''} ORDER BY date_debut DESC`,
      annee ? [cp, annee] : [cp]
    );
    const [reliquats] = await pool.query(
      `SELECT r.*, f.label as fete_label FROM reliquat_conge r
       LEFT JOIN fete f ON f.code=r.code_fete
       WHERE r.cp_agent=? ORDER BY r.date_limite`,
      [cp]
    );
    res.json({ demandes, reliquats });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/conges/:cp — créer une demande
async function createDemande(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp) return res.status(403).json({ error: 'Accès refusé' });
  const { annee, date_debut, date_fin, nb_jours, type, note_agent } = req.body;
  if (!annee || !date_debut || !date_fin || !nb_jours)
    return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const [result] = await pool.query(
      `INSERT INTO conge_demande (cp_agent,annee,date_debut,date_fin,nb_jours,type,statut,note_agent)
       VALUES (?,?,?,?,?,?,?,?)`,
      [cp, annee, date_debut, date_fin, nb_jours, type||'CA', 'demandé', note_agent||null]
    );
    res.status(201).json({ message: 'Demande créée', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PATCH /api/conges/:cp/:id — modifier statut ou réponse
async function updateDemande(req, res) {
  const { cp, id } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { statut, reponse_ecrite, date_reponse, note_agent } = req.body;
  const fields = [], values = [];
  if (statut)          { fields.push('statut=?');          values.push(statut); }
  if (reponse_ecrite)  { fields.push('reponse_ecrite=?');  values.push(reponse_ecrite); }
  if (date_reponse)    { fields.push('date_reponse=?');    values.push(date_reponse); }
  if (note_agent)      { fields.push('note_agent=?');      values.push(note_agent); }
  if (!fields.length)  return res.status(400).json({ error: 'Rien à modifier' });
  values.push(id, cp);
  try {
    await pool.query(`UPDATE conge_demande SET ${fields.join(',')} WHERE id=? AND cp_agent=?`, values);
    res.json({ message: 'Demande mise à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PATCH /api/conges/:cp/reliquats/:id — modifier un reliquat
async function updateReliquat(req, res) {
  const { cp, id } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { statut, date_prise, note } = req.body;
  const fields = [], values = [];
  if (statut)     { fields.push('statut=?');     values.push(statut); }
  if (date_prise) { fields.push('date_prise=?'); values.push(date_prise); }
  if (note)       { fields.push('note=?');       values.push(note); }
  if (!fields.length) return res.status(400).json({ error: 'Rien à modifier' });
  values.push(id, cp);
  try {
    await pool.query(`UPDATE reliquat_conge SET ${fields.join(',')} WHERE id=? AND cp_agent=?`, values);
    res.json({ message: 'Reliquat mis à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getConges, createDemande, updateDemande, updateReliquat };
