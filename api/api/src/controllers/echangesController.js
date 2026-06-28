const pool = require('../config/db');

// GET /api/echanges — liste triée par date la plus proche, avec demandeur + libellé poste + intéressés
async function getEchanges(req, res) {
  try {
    // Purge automatique : on retire les demandes dont la date est passée de plus de 2 mois
    await pool.query("DELETE FROM echange WHERE date_jour < DATE_SUB(CURDATE(), INTERVAL 2 MONTH)");

    const [rows] = await pool.query(
      `SELECT e.*, a.nom, a.prenom, p.label AS poste_label,
              ae.nom AS echange_avec_nom, ae.prenom AS echange_avec_prenom,
              (SELECT COUNT(*) FROM echange_interet ei WHERE ei.echange_id = e.id) AS nb_interets
       FROM echange e
       JOIN agent a ON a.cp = e.cp_demandeur
       LEFT JOIN poste p ON p.code = e.code_poste
       LEFT JOIN agent ae ON ae.cp = e.cp_echange_avec
       ORDER BY e.date_jour ASC, e.created_at ASC`
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// GET /api/echanges/:id/interesses — liste des agents intéressés
async function getInteresses(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT ei.cp_agent, a.nom, a.prenom, ei.created_at
       FROM echange_interet ei
       JOIN agent a ON a.cp = ei.cp_agent
       WHERE ei.echange_id = ?
       ORDER BY ei.created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges — créer une demande pour une journée
// Le poste/horaires sont récupérés depuis le planning du demandeur (jamais saisis à la main)
// Cas particulier nuit : si le jour choisi n'affiche qu'une "fin de nuit" (poste vide),
// on récupère le poste réel sur le "début de nuit" de la veille.
async function createEchange(req, res) {
  const cp = req.agent.cp;
  const { date_jour, creneaux_souhaites, secteurs_souhaites, urgent, motif } = req.body;
  if (!date_jour) return res.status(400).json({ error: 'date_jour requis' });

  try {
    let [[jour]] = await pool.query(
      `SELECT pp.code_poste, pp.heure_debut, pp.heure_fin
       FROM planning_jour pj
       JOIN planning_periode pp ON pp.planning_jour_id = pj.id
       WHERE pj.cp_agent = ? AND pj.date_jour = ? AND pp.code_poste IS NOT NULL
       ORDER BY pp.ordre ASC LIMIT 1`,
      [cp, date_jour]
    );

    if (!jour) {
      [[jour]] = await pool.query(
        `SELECT pp.code_poste, pp.heure_debut, pp.heure_fin
         FROM planning_jour pj
         JOIN planning_periode pp ON pp.planning_jour_id = pj.id
         WHERE pj.cp_agent = ? AND pj.date_jour = DATE_SUB(?, INTERVAL 1 DAY)
           AND pp.note = 'debut_nuit' AND pp.code_poste IS NOT NULL
         ORDER BY pp.ordre ASC LIMIT 1`,
        [cp, date_jour]
      );
    }

    if (!jour) return res.status(404).json({ error: 'Aucun poste précis trouvé dans ton planning pour cette date (jour de repos ou poste non renseigné).' });

    const creneauxStr = Array.isArray(creneaux_souhaites) ? creneaux_souhaites.join(',') : (creneaux_souhaites || null);
    const secteursStr = Array.isArray(secteurs_souhaites) ? secteurs_souhaites.join(',') : (secteurs_souhaites || null);

    const [result] = await pool.query(
      `INSERT INTO echange
        (cp_demandeur, date_jour, code_poste, heure_debut, heure_fin, creneaux_souhaites, secteurs_souhaites, urgent, motif)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [cp, date_jour, jour.code_poste, jour.heure_debut, jour.heure_fin, creneauxStr, secteursStr, urgent ? 1 : 0, motif || null]
    );
    res.status(201).json({ message: 'Demande créée', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PUT /api/echanges/:id — modifier les critères (seul le demandeur, tant qu'ouverte)
async function updateEchange(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  const { creneaux_souhaites, secteurs_souhaites, urgent, motif } = req.body;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur !== cp) return res.status(403).json({ error: 'Seul le demandeur peut modifier cette demande' });
    if (echange.statut !== 'ouverte') return res.status(409).json({ error: 'Demande déjà clôturée ou expirée' });

    const creneauxStr = Array.isArray(creneaux_souhaites) ? creneaux_souhaites.join(',') : (creneaux_souhaites ?? echange.creneaux_souhaites);
    const secteursStr = Array.isArray(secteurs_souhaites) ? secteurs_souhaites.join(',') : (secteurs_souhaites ?? echange.secteurs_souhaites);

    await pool.query(
      `UPDATE echange SET creneaux_souhaites=?, secteurs_souhaites=?, urgent=?, motif=? WHERE id=?`,
      [creneauxStr, secteursStr, urgent !== undefined ? (urgent ? 1 : 0) : echange.urgent, motif !== undefined ? motif : echange.motif, id]
    );
    res.json({ message: 'Demande mise à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges/:id/interet — se déclarer intéressé (ou retirer son intérêt si déjà fait)
async function toggleInteret(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur === cp) return res.status(400).json({ error: 'Tu ne peux pas te déclarer intéressé par ta propre demande' });

    const [[existant]] = await pool.query(
      'SELECT id FROM echange_interet WHERE echange_id=? AND cp_agent=?', [id, cp]
    );
    if (existant) {
      await pool.query('DELETE FROM echange_interet WHERE id=?', [existant.id]);
      return res.json({ message: 'Intérêt retiré', interesse: false });
    }
    await pool.query(
      'INSERT INTO echange_interet (echange_id, cp_agent) VALUES (?,?)', [id, cp]
    );
    res.json({ message: 'Intérêt enregistré', interesse: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges/:id/cloturer — seul le demandeur, précise avec qui
async function cloturer(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  const { cp_echange_avec } = req.body;
  if (!cp_echange_avec) return res.status(400).json({ error: 'cp_echange_avec requis' });
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur !== cp) return res.status(403).json({ error: 'Seul le demandeur peut clôturer cette demande' });
    if (echange.statut !== 'ouverte') return res.status(409).json({ error: 'Demande déjà clôturée ou expirée' });

    await pool.query(
      `UPDATE echange SET statut='cloturee', cp_echange_avec=?, cloturee_le=NOW() WHERE id=?`,
      [cp_echange_avec, id]
    );
    res.json({ message: 'Demande clôturée' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// DELETE /api/echanges/:id — seul le demandeur, à tout moment (ouverte, clôturée ou expirée)
async function deleteEchange(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur !== cp) return res.status(403).json({ error: 'Seul le demandeur peut supprimer cette demande' });

    await pool.query('DELETE FROM echange WHERE id=?', [id]);
    res.json({ message: 'Demande supprimée' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = {
  getEchanges, getInteresses, createEchange, updateEchange,
  toggleInteret, cloturer, deleteEchange
};
