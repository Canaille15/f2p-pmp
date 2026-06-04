const pool = require('../config/db');

// GET /api/profil/:cp
async function getProfil(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [[profil]]  = await pool.query('SELECT * FROM profil_agent WHERE cp_agent=?', [cp]);
    const [familles]  = await pool.query('SELECT * FROM agent_famille WHERE cp_agent=? ORDER BY date_debut DESC', [cp]);
    const [roulements]= await pool.query('SELECT * FROM roulement_historique WHERE cp_agent=? ORDER BY date_debut DESC', [cp]);
    const [habs]      = await pool.query('SELECT * FROM habilitation WHERE cp_agent=?', [cp]);
    res.json({ profil: profil||{}, familles, roulements, habilitations: habs });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PUT /api/profil/:cp — mettre à jour profil (couleurs, réserviste, familles_hab)
async function updateProfil(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { is_reserve, familles_hab, couleurs } = req.body;
  try {
    await pool.query(
      `INSERT INTO profil_agent (cp_agent, is_reserve, familles_hab, couleurs)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE
         is_reserve   = COALESCE(VALUES(is_reserve),   is_reserve),
         familles_hab = COALESCE(VALUES(familles_hab),  familles_hab),
         couleurs     = COALESCE(VALUES(couleurs),      couleurs)`,
      [cp,
       is_reserve  !== undefined ? (is_reserve?1:0) : null,
       familles_hab|| null,
       couleurs    ? JSON.stringify(couleurs) : null]
    );
    res.json({ message: 'Profil mis à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/profil/:cp/roulement — changer de roulement
async function setRoulement(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { type_roulement, date_debut, note } = req.body;
  if (!type_roulement || !date_debut)
    return res.status(400).json({ error: 'type_roulement et date_debut requis' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Fermer le roulement actif
    await conn.query(
      `UPDATE roulement_historique SET date_fin=? WHERE cp_agent=? AND date_fin IS NULL`,
      [date_debut, cp]
    );
    // Insérer le nouveau
    await conn.query(
      `INSERT INTO roulement_historique (cp_agent, type_roulement, date_debut, note)
       VALUES (?,?,?,?)`,
      [cp, type_roulement, date_debut, note||null]
    );
    await conn.commit();
    res.json({ message: 'Roulement mis à jour' });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// GET /api/profil/:cp/roulement/actif — roulement en cours
async function getRoulementActif(req, res) {
  const { cp } = req.params;
  try {
    const [[row]] = await pool.query(
      `SELECT * FROM roulement_historique WHERE cp_agent=? AND date_fin IS NULL
       ORDER BY date_debut DESC LIMIT 1`, [cp]
    );
    res.json(row || null);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

// PUT /api/profil/:cp/habilitations — sauvegarder les habilitations
async function setHabilitations(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { habilitations } = req.body; // [{code_poste, date_debut, date_fin?}]
  if (!Array.isArray(habilitations))
    return res.status(400).json({ error: 'habilitations doit être un tableau' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Supprimer les anciennes sans date_fin (actives)
    await conn.query('DELETE FROM habilitation WHERE cp_agent=?', [cp]);
    for (const h of habilitations) {
      if (!h.code_poste || !h.date_debut) continue;
      await conn.query(
        `INSERT INTO habilitation (cp_agent, code_poste, date_debut, date_fin)
         VALUES (?,?,?,?)`,
        [cp, h.code_poste, h.date_debut, h.date_fin||null]
      );
    }
    await conn.commit();
    res.json({ message: `${habilitations.length} habilitation(s) sauvegardée(s)` });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// POST /api/profil/:cp/famille — ajouter une affectation famille
async function addFamille(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { famille, type_affectation, date_debut } = req.body;
  if (!famille || !type_affectation || !date_debut)
    return res.status(400).json({ error: 'famille, type_affectation et date_debut requis' });
  try {
    await pool.query(
      `INSERT INTO agent_famille (cp_agent, famille, type_affectation, date_debut)
       VALUES (?,?,?,?)`,
      [cp, famille, type_affectation, date_debut]
    );
    res.json({ message: 'Famille ajoutée' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getProfil, updateProfil, setRoulement, getRoulementActif, setHabilitations, addFamille };
