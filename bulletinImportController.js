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

  // Fusion des entrées partageant la même date_jour AVANT tout traitement. Un
  // bulletin peut envoyer DEUX entrées séparées pour le même jour calendaire
  // (ex: "NU" la journée + une nuit de formation le soir même) : sans cette
  // fusion, la boucle principale traite chaque entrée l'une après l'autre et
  // fait un DELETE FROM planning_periode a chaque fois, ce qui efface
  // silencieusement les périodes de la première entrée quand la deuxième est
  // traitée pour la même date.
  const entriesByDate = new Map();
  for (const e of entries) {
    if (!e.date_jour) continue;
    const periodesDeE = (e.periodes && e.periodes.length > 0)
      ? e.periodes
      : (e.code_equipe ? [{
          code_equipe: e.code_equipe,
          code_poste: e.code_poste || null,
          heure_debut: e.heure_debut || null,
          heure_fin: e.heure_fin || null,
        }] : []);
    if (!entriesByDate.has(e.date_jour)) {
      entriesByDate.set(e.date_jour, { date_jour: e.date_jour, source_edition_date: e.source_edition_date || null, periodes: [] });
    }
    const merged = entriesByDate.get(e.date_jour);
    merged.periodes.push(...periodesDeE);
    // Garder la date d'édition la plus récente si plusieurs entrées diffèrent
    if (e.source_edition_date && (!merged.source_edition_date || new Date(e.source_edition_date) > new Date(merged.source_edition_date))) {
      merged.source_edition_date = e.source_edition_date;
    }
  }
  const mergedEntries = [...entriesByDate.values()].map(e => ({
    ...e,
    periodes: e.periodes.map((p, i) => ({ ...p, ordre: i + 1 })),
  }));

  const appliques = [];
  const ignores = [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const e of mergedEntries) {
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

      // Après fusion, toutes les entrées ont désormais un tableau periodes[]
      const hasPeriodes = e.periodes && e.periodes.length > 0 && e.periodes[0].code_equipe;
      if (!hasPeriodes) {
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

      const periodes = e.periodes;

      for (const p of periodes) {
        if (!p.code_equipe) continue;
        const prive = CODES_PUBLICS.has(p.code_equipe) ? 0 : 1;
        await conn.query(
          `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [jour.id, p.ordre || 1, p.code_equipe, p.code_poste || null, p.heure_debut || null, p.heure_fin || null, prive, null, null]
        );
      }
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
