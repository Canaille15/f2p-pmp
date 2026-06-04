const pool = require('../config/db');

// GET /api/echanges?date=YYYY-MM-DD&statut=ouvert
async function getEchanges(req, res) {
  const { date, statut } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT e.*, a.nom, a.prenom FROM echange e
       JOIN agent a ON a.cp=e.cp_initiateur
       WHERE (? IS NULL OR e.date_echange=?)
         AND (? IS NULL OR e.statut=?)
       ORDER BY e.created_at DESC`,
      [date||null, date||null, statut||null, statut||null]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges — proposer un échange
async function createEchange(req, res) {
  const cp = req.agent.cp;
  const { date_echange, message } = req.body;
  if (!date_echange) return res.status(400).json({ error: 'date_echange requis' });
  // Vérifier disponibilité
  const [indispo] = await pool.query(
    `SELECT id FROM disponibilite_echange
     WHERE cp_agent=? AND disponible=0
       AND (type='permanent' OR (date_debut<=? AND (date_fin IS NULL OR date_fin>=?)))`,
    [cp, date_echange, date_echange]
  );
  if (indispo.length) return res.status(409).json({ error: 'Vous êtes indisponible ce jour' });
  try {
    const [result] = await pool.query(
      `INSERT INTO echange (cp_initiateur, date_echange, message) VALUES (?,?,?)`,
      [cp, date_echange, message||null]
    );
    // Ajouter l'initiateur comme participant
    await pool.query(
      `INSERT INTO echange_participant (echange_id, cp_agent, role, statut_accord)
       VALUES (?,?,'initiateur','accepté')`,
      [result.insertId, cp]
    );
    res.status(201).json({ message: 'Échange proposé', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges/:id/candidater — se porter candidat
async function candidater(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id=?', [id]);
    if (!echange) return res.status(404).json({ error: 'Échange introuvable' });
    if (echange.statut !== 'ouvert') return res.status(409).json({ error: 'Échange non ouvert' });
    await pool.query(
      `INSERT INTO echange_participant (echange_id, cp_agent, role)
       VALUES (?,?,'candidat')
       ON DUPLICATE KEY UPDATE role='candidat'`,
      [id, cp]
    );
    await pool.query("UPDATE echange SET statut='en_cours' WHERE id=?", [id]);
    res.json({ message: 'Candidature enregistrée' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges/:id/valider — valider l'échange (vérif couverture postes)
async function valider(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[echange]] = await conn.query('SELECT * FROM echange WHERE id=?', [id]);
    if (!echange) return res.status(404).json({ error: 'Échange introuvable' });
    if (echange.cp_initiateur !== cp && !req.agent.is_admin)
      return res.status(403).json({ error: 'Seul l\'initiateur peut valider' });

    const [participants] = await conn.query(
      'SELECT * FROM echange_participant WHERE echange_id=?', [id]);

    // Vérifier que tous ont accepté
    const nonAcceptes = participants.filter(p => p.statut_accord !== 'accepté');
    if (nonAcceptes.length)
      return res.status(409).json({ error: 'Tous les participants doivent accepter' });

    // Vérifier couverture postes : chaque poste_avant doit être couvert par un poste_apres
    const postesAvant = participants.map(p => p.poste_avant).filter(Boolean);
    const postesApres = participants.map(p => p.poste_apres).filter(Boolean);
    const nonCouvert = postesAvant.filter(p => !postesApres.includes(p));
    if (nonCouvert.length)
      return res.status(409).json({
        error: `Postes non couverts : ${nonCouvert.join(', ')}` });

    // Modifier les plannings
    for (const p of participants) {
      if (!p.poste_apres) continue;
      const [[jour]] = await conn.query(
        'SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?',
        [p.cp_agent, echange.date_echange]);
      if (jour) {
        await conn.query(
          'UPDATE planning_periode SET code_poste=? WHERE planning_jour_id=? AND ordre=1',
          [p.poste_apres, jour.id]);
        // Badge échange
        await conn.query(
          `INSERT INTO echange_badge (planning_jour_id, echange_id, cp_agent_original, poste_original)
           VALUES (?,?,?,?)`,
          [jour.id, id, p.cp_agent, p.poste_avant]);
      }
    }
    await conn.query(
      "UPDATE echange SET statut='validé', validated_at=NOW() WHERE id=?", [id]);
    await conn.commit();
    res.json({ message: 'Échange validé' });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// PATCH /api/echanges/:id/repondre — accepter ou refuser
async function repondre(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  const { statut_accord, poste_avant, poste_apres } = req.body;
  if (!['accepté','refusé'].includes(statut_accord))
    return res.status(400).json({ error: 'statut_accord invalide' });
  try {
    await pool.query(
      `UPDATE echange_participant
       SET statut_accord=?, repondu_le=NOW(),
           poste_avant=COALESCE(?,poste_avant),
           poste_apres=COALESCE(?,poste_apres)
       WHERE echange_id=? AND cp_agent=?`,
      [statut_accord, poste_avant||null, poste_apres||null, id, cp]
    );
    if (statut_accord === 'refusé')
      await pool.query("UPDATE echange SET statut='refusé' WHERE id=?", [id]);
    res.json({ message: `Réponse enregistrée : ${statut_accord}` });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getEchanges, createEchange, candidater, valider, repondre };
