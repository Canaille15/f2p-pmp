const pool = require('../config/db');

// GET /api/fetes/:cp/:annee — suivi fêtes d'un agent pour une année
async function getSuivi(req, res) {
  const { cp, annee } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [rows] = await pool.query(
      `SELECT fs.*, f.label, f.type_calcul FROM fete_suivi fs
       JOIN fete f ON f.code=fs.code_fete
       WHERE fs.cp_agent=? AND fs.annee=?
       ORDER BY fs.date_fete_reelle`,
      [cp, annee]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PUT /api/fetes/:cp/:annee/:code — créer ou mettre à jour le suivi d'une fête
async function upsertSuivi(req, res) {
  const { cp, annee, code } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { date_fete_reelle, date_limite, date_prise, type_prise, statut, mois_paye, annee_paye, note } = req.body;
  try {
    await pool.query(
      `INSERT INTO fete_suivi
         (cp_agent,code_fete,annee,date_fete_reelle,date_limite,date_prise,type_prise,statut,mois_paye,annee_paye,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         date_prise  = COALESCE(VALUES(date_prise),  date_prise),
         type_prise  = COALESCE(VALUES(type_prise),  type_prise),
         statut      = VALUES(statut),
         mois_paye   = COALESCE(VALUES(mois_paye),   mois_paye),
         annee_paye  = COALESCE(VALUES(annee_paye),  annee_paye),
         note        = COALESCE(VALUES(note),         note)`,
      [cp, code, annee,
       date_fete_reelle||null, date_limite||null,
       date_prise||null, type_prise||null,
       statut||'à_venir',
       mois_paye||null, annee_paye||null, note||null]
    );
    res.json({ message: 'Suivi fête mis à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getSuivi, upsertSuivi };
