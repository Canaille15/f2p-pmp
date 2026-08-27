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
              pp.heure_debut, pp.heure_fin, pp.prive, pp.note, pp.note_perso, pp.etude_poste
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
        `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso,etude_poste)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [jour.id, p.ordre||1, p.code_equipe||(p.note==='fin_nuit'?'N':null), p.code_poste||null,
         p.heure_debut||null, p.heure_fin||null, prive, p.note||null, p.note_perso||null, p.etude_poste?1:0]);
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
              pp.heure_debut, pp.heure_fin, pp.note, pp.etude_poste
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

// POST /api/planning/:cp/bulk-fill (24/08, module "Remplissage rapide") :
// écrit le MÊME poste/vacation sur une liste de dates en un seul appel --
// équivalent en masse de setJour(), pour les agents peu habilités qui
// remplissent une année entière poste par poste plutôt que jour par jour.
// Garde-fou serveur (en plus du grisage déjà fait côté frontend avant la
// sélection) : un jour est ignoré s'il porte déjà un VRAI code_equipe en
// ordre=1 (jamais un simple repère placeholder 'fin_nuit'/'note_seule',
// même règle que isPlaceholder côté client -- getSchedule() -- pour rester
// cohérent avec ce que le frontend considère "libre").
async function bulkFill(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { dates, code_equipe, code_poste, heure_debut, heure_fin, overwrite } = req.body;
  if (!Array.isArray(dates) || dates.length === 0) return res.status(400).json({ error: 'Dates requises' });
  if (!code_equipe) return res.status(400).json({ error: 'code_equipe requis' });
  const prive = CODES_PUBLICS.has(code_equipe) ? 0 : 1;
  const appliques = [], ignores = [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const date of dates) {
      // overwrite (24/08, Congés "Accordé" en masse) : SEUL cas de tout ce
      // module qui écrase volontairement -- même règle que le popup de
      // saisie normal (le choix "Accordé" d'un congé écrase toujours ce qui
      // était déjà là, contrairement à RP/RU/postes de travail). false par
      // défaut, comportement inchangé pour tous les autres appelants.
      if (!overwrite) {
        const [[occupe]] = await conn.query(
          `SELECT pp.id FROM planning_jour pj
           JOIN planning_periode pp ON pp.planning_jour_id = pj.id AND pp.ordre = 1
           WHERE pj.cp_agent = ? AND pj.date_jour = ? AND pp.code_equipe IS NOT NULL
             AND NOT (pp.code_equipe = 'N' AND pp.note IN ('fin_nuit','note_seule'))`,
          [cp, date]
        );
        if (occupe) { ignores.push(date); continue; }
      }
      await conn.query(
        `INSERT INTO planning_jour (cp_agent, date_jour, source) VALUES (?,?,'manuel')
         ON DUPLICATE KEY UPDATE source='manuel', modifie_le=NOW()`,
        [cp, date]
      );
      const [[jour]] = await conn.query('SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp, date]);
      await conn.query('DELETE FROM planning_periode WHERE planning_jour_id=?', [jour.id]);
      await conn.query(
        `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
         VALUES (?,1,?,?,?,?,?,NULL,NULL)`,
        [jour.id, code_equipe, code_poste || null, heure_debut || null, heure_fin || null, prive]
      );
      appliques.push(date);
    }
    await conn.commit();
    res.json({ message: 'Remplissage appliqué', nb_appliques: appliques.length, appliques, ignores });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// POST /api/planning/:cp/bulk-clear (24/08) : efface le planning perso sur
// une période, avec sauvegarde complète pour annulation (même principe que
// l'annulation du dernier import CPS Officiel, déjà éprouvé sur ce projet).
// Contrairement à deleteJour() (existant, plus haut) qui ne supprime que
// planning_jour, celle-ci nettoie aussi explicitement planning_periode --
// planning_periode n'a aucune contrainte ON DELETE CASCADE depuis
// planning_jour (verifié sur le schema reel), un DELETE seul sur
// planning_jour y laisserait des lignes orphelines pour de bon.
async function bulkClear(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { date_from, date_to } = req.body;
  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from et date_to requis' });
  if (date_to < date_from) return res.status(400).json({ error: 'date_to doit être après date_from' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [jours] = await conn.query(
      `SELECT id, date_jour, source FROM planning_jour WHERE cp_agent=? AND date_jour BETWEEN ? AND ?`,
      [cp, date_from, date_to]
    );
    if (jours.length === 0) {
      await conn.rollback();
      return res.json({ message: 'Rien à effacer', nb_effaces: 0, batch_id: null });
    }
    const [batchResult] = await conn.query(
      `INSERT INTO planning_bulk_clear_batch (cp_agent, date_from, date_to, nb_jours) VALUES (?,?,?,?)`,
      [cp, date_from, date_to, jours.length]
    );
    const batchId = batchResult.insertId;
    let nbReellementEffaces = 0;
    let nbProteges = 0;
    for (const j of jours) {
      const [periodes] = await conn.query(
        `SELECT ordre, code_equipe, code_poste, heure_debut, heure_fin, prive, note, note_perso
         FROM planning_periode WHERE planning_jour_id=?`, [j.id]
      );
      // Congé ACCORDÉ (CA/CP, y compris en 2e créneau -- voir "un Congé peut
      // remplacer la Nuit", 25/08) jamais effacé par ce dispositif, même
      // dans la période choisie -- demande explicite d'Olivier : l'accord
      // représente un engagement réel, distinct d'un simple jour de travail
      // qu'on veut recommencer. Jour entièrement ignoré (ni sauvegardé pour
      // annulation, ni touché) -- rien n'y change, rien à restaurer.
      if (periodes.some(p => p.code_equipe === 'CA' || p.code_equipe === 'CP')) {
        nbProteges++;
        continue;
      }
      await conn.query(
        `INSERT INTO planning_bulk_clear_detail (batch_id, date_jour, source, periodes_json) VALUES (?,?,?,?)`,
        [batchId, j.date_jour, j.source, JSON.stringify(periodes)]
      );
      // Note perso jamais effacée par ce dispositif (24/08, demandé par
      // Olivier) : si une des périodes du jour en porte une, le jour est
      // réduit au même placeholder "note_seule" déjà utilisé partout
      // ailleurs dans l'appli (equipe='N', note='note_seule') au lieu
      // d'être supprimé en entier -- travail/RP/RU/descente de nuit
      // disparaissent, la note reste.
      const noteConservee = periodes.find(p => p.note_perso);
      // Un jour qui n'avait déjà qu'une note (rien d'autre) ressort de ce
      // traitement strictement identique à avant -- un vrai no-op, à ne pas
      // compter dans "nb_effaces" (sinon incohérent avec l'aperçu affiché
      // avant confirmation, qui exclut déjà ce cas).
      const estNoteSeuleNoOp = periodes.length === 1 && periodes[0].code_equipe === 'N' && periodes[0].note === 'note_seule' && periodes[0].note_perso;
      if (!estNoteSeuleNoOp) nbReellementEffaces++;
      await conn.query('DELETE FROM planning_periode WHERE planning_jour_id=?', [j.id]);
      if (noteConservee) {
        await conn.query(
          `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
           VALUES (?,1,'N',NULL,NULL,NULL,0,'note_seule',?)`,
          [j.id, noteConservee.note_perso]
        );
      } else {
        await conn.query('DELETE FROM planning_jour WHERE id=?', [j.id]);
      }
    }
    await conn.commit();
    res.json({ message: 'Planning effacé', nb_effaces: nbReellementEffaces, nb_proteges: nbProteges, batch_id: batchId });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// POST /api/planning/:cp/bulk-clear/:batchId/undo -- restaure exactement
// l'état d'avant un effacement en masse, tant qu'il n'a jamais été annulé.
async function bulkClearUndo(req, res) {
  const { cp, batchId } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const conn = await pool.getConnection();
  try {
    const [[batch]] = await conn.query(
      `SELECT * FROM planning_bulk_clear_batch WHERE id=? AND cp_agent=?`, [batchId, cp]
    );
    if (!batch) return res.status(404).json({ error: 'Effacement introuvable' });
    if (batch.annule_le) return res.status(409).json({ error: 'Cet effacement a déjà été annulé' });
    await conn.beginTransaction();
    const [details] = await conn.query(
      `SELECT * FROM planning_bulk_clear_detail WHERE batch_id=?`, [batchId]
    );
    for (const d of details) {
      await conn.query(
        `INSERT INTO planning_jour (cp_agent, date_jour, source) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE source=VALUES(source), modifie_le=NOW()`,
        [cp, d.date_jour, d.source]
      );
      const [[jour]] = await conn.query('SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp, d.date_jour]);
      await conn.query('DELETE FROM planning_periode WHERE planning_jour_id=?', [jour.id]);
      const periodes = typeof d.periodes_json === 'string' ? JSON.parse(d.periodes_json) : d.periodes_json;
      for (const p of periodes) {
        await conn.query(
          `INSERT INTO planning_periode (planning_jour_id,ordre,code_equipe,code_poste,heure_debut,heure_fin,prive,note,note_perso)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [jour.id, p.ordre||1, p.code_equipe||null, p.code_poste||null, p.heure_debut||null, p.heure_fin||null, p.prive?1:0, p.note||null, p.note_perso||null]
        );
      }
    }
    await conn.query(`UPDATE planning_bulk_clear_batch SET annule_le=NOW() WHERE id=?`, [batchId]);
    await conn.commit();
    res.json({ message: 'Effacement annulé', nb_restaures: details.length });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

module.exports = { getPlanning, getAllPublic, setJour, deleteJour, bulkFill, bulkClear, bulkClearUndo };
