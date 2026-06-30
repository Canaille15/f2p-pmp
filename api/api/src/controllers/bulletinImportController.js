const pool = require('../config/db');
const CODES_PUBLICS = new Set(['M','AM','N','J','JF','FOR','DISPO']);

/**
 * POST /api/planning/:cp/import-bulletin
 * body: {
 *   entries: [
 *     { date_jour:'YYYY-MM-DD', code_equipe:'M|AM|N|J|RP|CA|...', code_poste:'PICCL-'|null,
 *       heure_debut:'HH:MM:SS'|null, heure_fin:'HH:MM:SS'|null, source_edition_date:'YYYY-MM-DD HH:MM:SS' }
 *   ],
 *   source_type: 'bulletin' | 'previsionnel'
 * }
 *
 * Règle de fusion : un jour n'est écrasé que si source_edition_date du jour existant
 * est NULL (= saisie manuelle, jamais de date d'édition) OU si la nouvelle date
 * d'édition est strictement postérieure à celle déjà enregistrée. Sinon le jour
 * est ignoré silencieusement (jamais de régression).
 *
 * Accès : réservé au titulaire du planning (PAS d'écriture admin sur autrui,
 * conformément à la règle "admin = lecture seule sur le planning des autres agents").
 */
async function importBulletin(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp) {
    return res.status(403).json({ error: "Seul le titulaire peut importer un bulletin sur son propre planning" });
  }
  const { entries, source_type } = req.body;
  if (!entries?.length) return res.status(400).json({ error: 'Entrées requises' });
  const sourceDb = source_type === 'previsionnel' ? 'previsionnel' : 'bulletin';

  const appliques = [];
  const ignores = [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const e of entries) {
      if (!e.date_jour) continue;

      const [[existing]] = await conn.query(
        'SELECT id, source_edition_date FROM planning_jour WHERE cp_agent=? AND date_jour=?',
        [cp, e.date_jour]
      );

      const newEdition = e.source_edition_date || null;
      if (existing && existing.source_edition_date && newEdition) {
        const existingDate = new Date(existing.source_edition_date).getTime();
        const candidateDate = new Date(newEdition).getTime();
        if (candidateDate <= existingDate) {
          ignores.push({ date: e.date_jour, motif: 'edition_plus_ancienne' });
          continue;
        }
      }

      if (!e.code_equipe) {
        ignores.push({ date: e.date_jour, motif: 'code_equipe_manquant' });
        continue;
      }

      await conn.query(
        `INSERT INTO planning_jour (cp_agent, date_jour, source, source_edition_date)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE source=VALUES(source), source_edition_date=VALUES(source_edition_date), modifie_le=NOW()`,
        [cp, e.date_jour, sourceDb, newEdition]
      );
      const [[jour]] = await conn.query(
        'SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp, e.date_jour]
      );
      await conn.query('DELETE FROM planning_periode WHERE planning_jour_id=?', [jour.id]);

      const codeEquipe = e.code_equipe || null;
      const prive = CODES_PUBLICS.has(codeEquipe) ? 0 : 1;
      await conn.query(
        `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
         VALUES (?,1,?,?,?,?,?,?,?)`,
        [jour.id, codeEquipe, e.code_poste || null, e.heure_debut || null, e.heure_fin || null, prive, null, null]
      );
      appliques.push(e.date_jour);
    }

    await conn.commit();
    res.json({ message: 'Import appliqué', nb_appliques: appliques.length, appliques, ignores });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
}

module.exports = { importBulletin };
