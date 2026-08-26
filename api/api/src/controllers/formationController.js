const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Helpers d'écriture/lecture du planning perso (partagés par lancerSession,
// addParticipant et l'auto-déclaration).
//
// 10/08 (retour d'Olivier après un premier essai bloquant) : la formation
// n'écrase JAMAIS plus rien, mais ne bloque plus non plus si le jour est
// déjà occupé — elle est toujours ajoutée comme une période INDÉPENDANTE
// supplémentaire (même principe que "Grève" DA/DB/DC, note='formation',
// jamais dans la période principale equipe/equipe2 — voir client.js
// getSchedule/saveEntry). L'agent voit alors DEUX éléments dans sa case :
// sa journée existante ET le badge "🎓 Formation". Il valide sa présence en
// libérant sa journée (efface l'autre contenu), ou décline en retirant le
// badge Formation depuis DayEditPopup — jamais de conflit "bloqué" côté AFO.
// ─────────────────────────────────────────────────────────────────────────

async function ecrireFor(conn, cp_agent, date_jour, intitule) {
  await conn.query(
    `INSERT INTO planning_jour (cp_agent, date_jour, source) VALUES (?,?,'manuel')
     ON DUPLICATE KEY UPDATE modifie_le = NOW()`,
    [cp_agent, date_jour]
  );
  const [[jour]] = await conn.query(
    'SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp_agent, date_jour]
  );
  // Ne pas dupliquer si une periode formation existe deja pour ce jour
  // (ex: addParticipant appele deux fois, ou deja inscrit).
  const [existant] = await conn.query(
    `SELECT id FROM planning_periode WHERE planning_jour_id=? AND note='formation'`, [jour.id]
  );
  if (existant.length) return { ok: true, deja: true };
  const [[{ maxOrdre }]] = await conn.query(
    `SELECT COALESCE(MAX(ordre), 0) AS maxOrdre FROM planning_periode WHERE planning_jour_id=?`, [jour.id]
  );
  await conn.query(
    `INSERT INTO planning_periode (planning_jour_id, ordre, code_equipe, code_poste, prive, note)
     VALUES (?, ?, 'FOR', ?, 0, 'formation')`,
    [jour.id, maxOrdre + 1, (intitule || '').slice(0, 100) || null]
  );
  return { ok: true, deja: false };
}

// Retire UNIQUEMENT la periode formation (note='formation'), jamais le reste
// du jour — si l'agent avait deja libere sa journee (plus aucune autre
// periode), le planning_jour vide est nettoye au passage.
async function effacerPeriodeFormation(conn, cp_agent, date_jour) {
  const [[jour]] = await conn.query('SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp_agent, date_jour]);
  if (!jour) return false;
  const [rows] = await conn.query(`SELECT id FROM planning_periode WHERE planning_jour_id=? AND note='formation'`, [jour.id]);
  if (!rows.length) return false;
  for (const r of rows) await conn.query('DELETE FROM planning_periode WHERE id=?', [r.id]);
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM planning_periode WHERE planning_jour_id=?', [jour.id]);
  if (n === 0) await conn.query('DELETE FROM planning_jour WHERE id=?', [jour.id]);
  return true;
}

async function materialiserNotification(conn, cp_agent, notif) {
  const patch = JSON.stringify({ formationNotifications: [notif] });
  // JSON_MERGE_PATCH remplacerait le tableau entier plutot que de l'etendre
  // (comportement standard sur un type array) -> on lit l'existant, on
  // ajoute, on ecrit le tableau complet en JSON_MERGE_PATCH pour ne toucher
  // a aucune autre cle de donnees_json.
  const [[row]] = await conn.query('SELECT donnees_json FROM profil_agent WHERE cp_agent=?', [cp_agent]);
  const existant = row?.donnees_json ? (typeof row.donnees_json === 'string' ? JSON.parse(row.donnees_json) : row.donnees_json) : {};
  const liste = Array.isArray(existant.formationNotifications) ? existant.formationNotifications : [];
  liste.push(notif);
  await conn.query(
    `INSERT INTO profil_agent (cp_agent, donnees_json) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE donnees_json = JSON_MERGE_PATCH(COALESCE(donnees_json,'{}'), ?)`,
    [cp_agent, JSON.stringify({ formationNotifications: liste }), JSON.stringify({ formationNotifications: liste })]
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────

async function getCatalogue(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM formation_catalogue ORDER BY categorie, intitule');
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function createCatalogue(req, res) {
  const { categorie, intitule, description, duree, duree_heures, format, public_cible, prerequis, obligatoire } = req.body;
  if (!categorie || !intitule) return res.status(400).json({ error: 'Catégorie et intitulé requis' });
  try {
    const [result] = await pool.query(
      `INSERT INTO formation_catalogue (categorie, intitule, description, duree, duree_heures, format, public_cible, prerequis, obligatoire, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [categorie, intitule, description || null, duree || null, duree_heures || null, format || null, public_cible || null, prerequis || null, obligatoire ? 1 : 0, req.agent.cp]
    );
    res.status(201).json({ message: 'Formation créée', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function updateCatalogue(req, res) {
  const { id } = req.params;
  const { categorie, intitule, description, duree, duree_heures, format, public_cible, prerequis, obligatoire, statut } = req.body;
  const fields = [], values = [];
  if (categorie !== undefined)     { fields.push('categorie = ?');     values.push(categorie); }
  if (intitule !== undefined)      { fields.push('intitule = ?');      values.push(intitule); }
  if (description !== undefined)   { fields.push('description = ?');   values.push(description || null); }
  if (duree !== undefined)         { fields.push('duree = ?');         values.push(duree || null); }
  if (duree_heures !== undefined)  { fields.push('duree_heures = ?');  values.push(duree_heures || null); }
  if (format !== undefined)        { fields.push('format = ?');        values.push(format || null); }
  if (public_cible !== undefined)  { fields.push('public_cible = ?');  values.push(public_cible || null); }
  if (prerequis !== undefined)     { fields.push('prerequis = ?');     values.push(prerequis || null); }
  if (obligatoire !== undefined)   { fields.push('obligatoire = ?');   values.push(obligatoire ? 1 : 0); }
  if (statut !== undefined)        { fields.push('statut = ?');        values.push(statut); }
  if (!fields.length) return res.status(400).json({ error: 'Rien à modifier' });
  values.push(id);
  try {
    await pool.query(`UPDATE formation_catalogue SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Formation mise à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function deleteCatalogue(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM formation_catalogue WHERE id = ?', [id]);
    res.json({ message: 'Formation supprimée' });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(400).json({ error: 'Des sessions existent déjà pour cette formation — archive-la plutôt que de la supprimer.' });
    }
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────

// 10/08 : roster complet (formateurs+participants) ajoute a la liste, pour
// qu'un AFO puisse lire les noms directement sans ouvrir chaque session
// (Olivier : "il faut pour lire le nom du formateur et des participants").
async function getSessions(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT fs.*, fc.intitule, fc.categorie,
              (SELECT COUNT(*) FROM formation_enrollment fe WHERE fe.session_id = fs.id) AS nb_participants
       FROM formation_session fs
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       ORDER BY fs.date_session DESC`
    );
    if (!rows.length) return res.json([]);
    const ids = rows.map(r => r.id);
    const [formateurs] = await pool.query(
      `SELECT fsf.session_id, a.cp, a.nom, a.prenom FROM formation_session_formateur fsf
       JOIN agent a ON a.cp = fsf.cp_agent WHERE fsf.session_id IN (?)`, [ids]
    );
    const [participants] = await pool.query(
      `SELECT fe.session_id, a.cp, a.nom, a.prenom FROM formation_enrollment fe
       JOIN agent a ON a.cp = fe.cp_agent WHERE fe.session_id IN (?)`, [ids]
    );
    res.json(rows.map(r => ({
      ...r,
      formateurs: formateurs.filter(f => f.session_id === r.id).map(f => ({ cp: f.cp, nom: f.nom, prenom: f.prenom })),
      participants: participants.filter(p => p.session_id === r.id).map(p => ({ cp: p.cp, nom: p.nom, prenom: p.prenom })),
    })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function getSessionDetail(req, res) {
  const { id } = req.params;
  try {
    const [[session]] = await pool.query(
      `SELECT fs.*, fc.intitule, fc.categorie
       FROM formation_session fs JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       WHERE fs.id = ?`, [id]
    );
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const [formateurs] = await pool.query(
      `SELECT a.cp, a.nom, a.prenom FROM formation_session_formateur fsf
       JOIN agent a ON a.cp = fsf.cp_agent WHERE fsf.session_id = ?`, [id]
    );

    // toujours_present calcule a la lecture (jamais stocke) : compare
    // l'inscription au contenu REEL du planning de l'agent ce jour-la.
    // N'a de sens que si la session a ete lancee (avant, rien n'a jamais
    // ete ecrit — le frontend ignore ce champ tant que statut!=='lancee').
    const [participants] = await pool.query(
      `SELECT fe.cp_agent, a.nom, a.prenom, fe.inscrit_le,
              EXISTS(
                SELECT 1 FROM planning_jour pj
                JOIN planning_periode pp ON pp.planning_jour_id = pj.id
                WHERE pj.cp_agent = fe.cp_agent AND pj.date_jour = ? AND pp.code_equipe = 'FOR'
              ) AS toujours_present
       FROM formation_enrollment fe
       JOIN agent a ON a.cp = fe.cp_agent
       WHERE fe.session_id = ?
       ORDER BY a.nom, a.prenom`,
      [session.date_session, id]
    );

    res.json({ session, formateurs, participants: participants.map(p => ({ ...p, toujours_present: !!p.toujours_present })) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function createSession(req, res) {
  const { catalogue_id, date_session, heure_debut, lieu, message_lancement, formateurs, participants } = req.body;
  if (!catalogue_id || !date_session) return res.status(400).json({ error: 'catalogue_id et date_session requis' });
  if (formateurs && formateurs.length > 3) return res.status(400).json({ error: 'Jusqu\'à 3 formateurs maximum' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO formation_session (catalogue_id, date_session, heure_debut, lieu, message_lancement, cp_agent_creation)
       VALUES (?,?,?,?,?,?)`,
      [catalogue_id, date_session, heure_debut || null, lieu || null, message_lancement || null, req.agent.cp]
    );
    const sessionId = result.insertId;
    for (const cp of (formateurs || [])) {
      await conn.query('INSERT INTO formation_session_formateur (session_id, cp_agent) VALUES (?,?)', [sessionId, cp]);
    }
    for (const cp of (participants || [])) {
      await conn.query('INSERT INTO formation_enrollment (session_id, cp_agent, inscrit_par) VALUES (?,?,?)', [sessionId, cp, req.agent.cp]);
    }
    await conn.commit();
    res.status(201).json({ message: 'Session créée', id: sessionId });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

async function updateSession(req, res) {
  const { id } = req.params;
  const { lieu, heure_debut, message_lancement, date_session, statut } = req.body;
  try {
    const [[session]] = await pool.query('SELECT statut, date_session FROM formation_session WHERE id=?', [id]);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (date_session !== undefined && date_session !== session.date_session && session.statut !== 'planifiee') {
      return res.status(400).json({ error: 'La date ne peut plus changer une fois la session lancée (le planning des participants a déjà été écrit pour la date initiale).' });
    }
    const fields = [], values = [];
    if (lieu !== undefined)              { fields.push('lieu = ?');              values.push(lieu || null); }
    if (heure_debut !== undefined)       { fields.push('heure_debut = ?');       values.push(heure_debut || null); }
    if (message_lancement !== undefined) { fields.push('message_lancement = ?'); values.push(message_lancement || null); }
    if (date_session !== undefined)      { fields.push('date_session = ?');      values.push(date_session); }
    if (statut !== undefined)            { fields.push('statut = ?');            values.push(statut); }
    if (!fields.length) return res.status(400).json({ error: 'Rien à modifier' });
    values.push(id);
    await pool.query(`UPDATE formation_session SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Session mise à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function addFormateur(req, res) {
  const { id } = req.params;
  const { cp_agent } = req.body;
  if (!cp_agent) return res.status(400).json({ error: 'cp_agent requis' });
  try {
    const [[isAfoRow]] = await pool.query('SELECT is_afo FROM profil_agent WHERE cp_agent=?', [cp_agent]);
    if (!isAfoRow?.is_afo) return res.status(400).json({ error: 'Cet agent n\'est pas formateur AFO' });
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM formation_session_formateur WHERE session_id=?', [id]);
    if (n >= 3) return res.status(400).json({ error: 'Jusqu\'à 3 formateurs maximum par session' });
    await pool.query('INSERT INTO formation_session_formateur (session_id, cp_agent) VALUES (?,?)', [id, cp_agent]);
    res.status(201).json({ message: 'Formateur ajouté' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Déjà formateur de cette session' });
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function removeFormateur(req, res) {
  const { id, cp } = req.params;
  try {
    await pool.query('DELETE FROM formation_session_formateur WHERE session_id=? AND cp_agent=?', [id, cp]);
    res.json({ message: 'Formateur retiré' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function addParticipant(req, res) {
  const { id } = req.params;
  const { cp_agent } = req.body;
  if (!cp_agent) return res.status(400).json({ error: 'cp_agent requis' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[session]] = await conn.query('SELECT * FROM formation_session WHERE id=?', [id]);
    if (!session) { await conn.rollback(); return res.status(404).json({ error: 'Session introuvable' }); }
    await conn.query('INSERT INTO formation_enrollment (session_id, cp_agent, inscrit_par) VALUES (?,?,?)', [id, cp_agent, req.agent.cp]);

    // Si la session a deja ete lancee, ce nouveau participant doit recevoir
    // le meme traitement immediatement (ecriture planning + notification) —
    // sinon il n'aurait ni FOR dans son planning, ni signal de nouveaute.
    if (session.statut === 'lancee') {
      const [[cat]] = await conn.query('SELECT intitule FROM formation_catalogue WHERE id=?', [session.catalogue_id]);
      await ecrireFor(conn, cp_agent, session.date_session, cat.intitule);
      await materialiserNotification(conn, cp_agent, {
        enrollmentId: `${id}-${cp_agent}`, sessionId: Number(id),
        titre: `🎓 Nouvelle formation : ${cat.intitule}`,
        dateSession: session.date_session, lieu: session.lieu,
        message: session.message_lancement || null, acquitte: false,
      });
    }
    await conn.commit();
    res.status(201).json({ message: 'Participant ajouté' });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Déjà inscrit à cette session' });
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

async function removeParticipant(req, res) {
  const { id, cp } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[session]] = await conn.query('SELECT date_session FROM formation_session WHERE id=?', [id]);
    if (!session) { await conn.rollback(); return res.status(404).json({ error: 'Session introuvable' }); }
    // Retire uniquement la periode formation independante (note='formation')
    // — ne touche jamais au reste du jour, quel qu'il soit.
    await effacerPeriodeFormation(conn, cp, session.date_session);
    await conn.query('DELETE FROM formation_enrollment WHERE session_id=? AND cp_agent=?', [id, cp]);
    await conn.commit();
    res.json({ message: 'Participant retiré' });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// DELETE /formation/sessions/:id — supprime totalement la session (utile pour
// annuler une session creee par erreur). Si elle avait deja ete lancee,
// nettoie d'abord le planning de chaque participant (meme garde que
// removeParticipant : seulement si le jour contient encore exactement ce
// qui avait ete ecrit).
async function deleteSession(req, res) {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[session]] = await conn.query('SELECT date_session FROM formation_session WHERE id=?', [id]);
    if (!session) { await conn.rollback(); return res.status(404).json({ error: 'Session introuvable' }); }
    const [participants] = await conn.query('SELECT cp_agent FROM formation_enrollment WHERE session_id=?', [id]);
    for (const p of participants) {
      await effacerPeriodeFormation(conn, p.cp_agent, session.date_session);
    }
    await conn.query('DELETE FROM formation_session WHERE id=?', [id]);
    await conn.commit();
    res.json({ message: 'Session supprimée' });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// POST /formation/sessions/:id/lancer — point pivot : ecrit FOR dans le
// planning de chaque inscrit (garde-fou individuel, jamais d'ecrasement),
// materialise une notification pour chaque agent inscrit avec succes.
async function lancerSession(req, res) {
  const { id } = req.params;
  const { message } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[session]] = await conn.query(
      `SELECT fs.*, fc.intitule FROM formation_session fs
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id WHERE fs.id=? FOR UPDATE`, [id]
    );
    if (!session) { await conn.rollback(); return res.status(404).json({ error: 'Session introuvable' }); }
    if (session.statut === 'lancee') { await conn.rollback(); return res.status(400).json({ error: 'Session déjà lancée' }); }

    const [enrollments] = await conn.query(
      `SELECT fe.cp_agent, a.nom, a.prenom FROM formation_enrollment fe
       JOIN agent a ON a.cp = fe.cp_agent WHERE fe.session_id=?`, [id]
    );

    const succes = [];
    for (const agent of enrollments) {
      await ecrireFor(conn, agent.cp_agent, session.date_session, session.intitule);
      succes.push({ cp_agent: agent.cp_agent, nom: agent.nom, prenom: agent.prenom });
      await materialiserNotification(conn, agent.cp_agent, {
        enrollmentId: `${id}-${agent.cp_agent}`, sessionId: Number(id),
        titre: `🎓 Nouvelle formation : ${session.intitule}`,
        dateSession: session.date_session, lieu: session.lieu,
        message: message ?? session.message_lancement ?? null, acquitte: false,
      });
    }

    const fields = [`statut = 'lancee'`, `lancee_le = NOW()`];
    const values = [];
    if (message !== undefined) { fields.push('message_lancement = ?'); values.push(message || null); }
    values.push(id);
    await conn.query(`UPDATE formation_session SET ${fields.join(', ')} WHERE id = ?`, values);

    await conn.commit();
    res.json({ message: 'Session lancée', succes });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// ─────────────────────────────────────────────────────────────────────────
// Vue agent — "Mes formations" (sessions AFO où l'agent connecté est inscrit)
// ─────────────────────────────────────────────────────────────────────────

// 10/08 : etend la vue "Mes formations" pour couvrir aussi bien les sessions
// ou l'agent est inscrit (participant) que celles ou il intervient comme
// formateur (AFO) -- un AFO n'a plus besoin d'aller fouiller "Gestion" pour
// retrouver ses propres journees de formateur. Chaque ligne est taguee
// est_participant/est_formateur (une session peut cumuler les deux), et
// porte desormais le roster complet (formateurs+participants) pour que
// "Mes formations" affiche qui anime/qui participe sans requete separee.
async function getMesSessions(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT fs.id, fs.date_session, fs.heure_debut, fs.lieu, fs.statut, fs.message_lancement,
              fc.intitule, fc.categorie,
              EXISTS(SELECT 1 FROM formation_enrollment fe2 WHERE fe2.session_id=fs.id AND fe2.cp_agent=?) AS est_participant,
              EXISTS(SELECT 1 FROM formation_session_formateur fsf2 WHERE fsf2.session_id=fs.id AND fsf2.cp_agent=?) AS est_formateur,
              EXISTS(
                SELECT 1 FROM planning_jour pj JOIN planning_periode pp ON pp.planning_jour_id=pj.id
                WHERE pj.cp_agent=? AND pj.date_jour=fs.date_session AND pp.code_equipe='FOR'
              ) AS toujours_present
       FROM formation_session fs
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       WHERE fs.id IN (
         SELECT session_id FROM formation_enrollment WHERE cp_agent=?
         UNION
         SELECT session_id FROM formation_session_formateur WHERE cp_agent=?
       )
       ORDER BY fs.date_session DESC`,
      [req.agent.cp, req.agent.cp, req.agent.cp, req.agent.cp, req.agent.cp]
    );
    if (!rows.length) return res.json([]);
    const ids = rows.map(r => r.id);
    const [formateurs] = await pool.query(
      `SELECT fsf.session_id, a.cp, a.nom, a.prenom FROM formation_session_formateur fsf
       JOIN agent a ON a.cp = fsf.cp_agent WHERE fsf.session_id IN (?)`, [ids]
    );
    const [participants] = await pool.query(
      `SELECT fe.session_id, a.cp, a.nom, a.prenom FROM formation_enrollment fe
       JOIN agent a ON a.cp = fe.cp_agent WHERE fe.session_id IN (?)`, [ids]
    );
    res.json(rows.map(r => ({
      ...r,
      est_participant: !!r.est_participant,
      est_formateur: !!r.est_formateur,
      toujours_present: !!r.toujours_present,
      formateurs: formateurs.filter(f => f.session_id === r.id).map(f => ({ cp: f.cp, nom: f.nom, prenom: f.prenom })),
      participants: participants.filter(p => p.session_id === r.id).map(p => ({ cp: p.cp, nom: p.nom, prenom: p.prenom })),
    })));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// GET /formation/proposees/:date — sessions LANCEES ce jour-la ou l'agent
// connecte est inscrit, quel que soit son etat actuel (toujours_present ou
// non) -- alimente le selecteur du popup de planning perso (DayEditPopup)
// qui permet a un agent de RESTAURER sa participation apres l'avoir
// retiree (10/08, Olivier : "si un agnent se remet en formation sur une
// date il faut qu'il choisisse la formation [...] dans la pop up sur celle
// proposee ce jour la"). Uniquement les sessions lancees : une session
// encore "planifiee" n'a jamais rien ecrit dans le planning, rien a
// restaurer.
async function getFormationsProposees(req, res) {
  const { date } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT fs.id, fc.intitule, fs.heure_debut, fs.lieu
       FROM formation_enrollment fe
       JOIN formation_session fs ON fs.id = fe.session_id
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       WHERE fe.cp_agent = ? AND fs.date_session = ? AND fs.statut = 'lancee'
       ORDER BY fc.intitule`,
      [req.agent.cp, date]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /formation/perso — auto-declaration (externe/e-learning), sans AFO,
// meme garde-fou anti-ecrasement que les sessions AFO. Stockee dans
// profil_agent.donnees_json (voir client.js EXTRA_KEYS), pas de table dediee
// puisqu'aucune agregation cross-agent n'est necessaire dessus.
async function declarerFormationPerso(req, res) {
  const { date, intitule, organisme, format } = req.body;
  if (!date || !intitule) return res.status(400).json({ error: 'date et intitulé requis' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ecrireFor(conn, req.agent.cp, date, intitule);
    const [[row]] = await conn.query('SELECT donnees_json FROM profil_agent WHERE cp_agent=?', [req.agent.cp]);
    const existant = row?.donnees_json ? (typeof row.donnees_json === 'string' ? JSON.parse(row.donnees_json) : row.donnees_json) : {};
    const liste = Array.isArray(existant.formationsPersoDeclarees) ? existant.formationsPersoDeclarees : [];
    const entree = { id: Date.now(), date, intitule, organisme: organisme || null, format: format === 'e-learning' ? 'e-learning' : 'externe' };
    liste.push(entree);
    await conn.query(
      `INSERT INTO profil_agent (cp_agent, donnees_json) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE donnees_json = JSON_MERGE_PATCH(COALESCE(donnees_json,'{}'), ?)`,
      [req.agent.cp, JSON.stringify({ formationsPersoDeclarees: liste }), JSON.stringify({ formationsPersoDeclarees: liste })]
    );
    await conn.commit();
    res.status(201).json({ message: 'Formation déclarée', entree });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// ─────────────────────────────────────────────────────────────────────────
// Stats AFO — agrégations pures, aucune nouvelle donnée saisie. Tous les AFO
// sont a egalite : aucun filtrage par createur/formateur ici, sauf pour la
// section "par AFO" qui montre precisement les stats de CHAQUE AFO (visibles
// par tous les autres AFO).
// ─────────────────────────────────────────────────────────────────────────

// 10/08 : un agent qui a decline (retire la formation de son planning) une
// session lancee n'a en realite jamais suivi la formation -- exclu du
// comptage "agents formes" (Olivier : "si un agent ne participe plus a la
// formation [...] ca met a jour les stats"). Plus besoin d'attendre que la
// date soit passee (simplifie le 10/08 -- second retour d'Olivier : "c'est
// peu utile d'attendre la date, vu que l'agent peut se remettre sur une des
// formations prevue ce jour la") -- des qu'il decline, il n'est plus compte,
// meme si le jour meme n'est pas encore arrive ; des qu'il se reinscrit (voir
// picker DayEditPopup), il recompte aussitot. Une session pas encore lancee
// reste toujours comptee normalement.
// 26/08 : extraite en constante partagee (getStats ET getCouvertureFormation
// ont besoin exactement de la meme regle, pour ne jamais diverger).
const PRESENCE_REELLE = `(
  fs.statut != 'lancee' OR EXISTS(
    SELECT 1 FROM planning_jour pj JOIN planning_periode pp ON pp.planning_jour_id=pj.id
    WHERE pj.cp_agent = fe.cp_agent AND pj.date_jour = fs.date_session AND pp.code_equipe='FOR'
  )
)`;

async function getStats(req, res) {
  try {
    const [parFormationBase] = await pool.query(
      `SELECT fc.id AS catalogue_id, fc.intitule, fc.categorie,
              COUNT(DISTINCT fs.id) AS nb_sessions
       FROM formation_catalogue fc
       LEFT JOIN formation_session fs ON fs.catalogue_id = fc.id
       GROUP BY fc.id, fc.intitule, fc.categorie
       ORDER BY fc.categorie, fc.intitule`
    );
    const [agentsParFormation] = await pool.query(
      `SELECT fs.catalogue_id, a.cp, a.nom, a.prenom
       FROM formation_enrollment fe
       JOIN formation_session fs ON fs.id = fe.session_id
       JOIN agent a ON a.cp = fe.cp_agent
       WHERE ${PRESENCE_REELLE}
       GROUP BY fs.catalogue_id, a.cp, a.nom, a.prenom`
    );
    const parFormation = parFormationBase.map(f => ({
      ...f,
      agents: agentsParFormation.filter(a => a.catalogue_id === f.catalogue_id).map(a => ({ cp: a.cp, nom: a.nom, prenom: a.prenom })),
    }));

    // Répartition annuelle par catégorie × source (sessions AFO)
    const [viaAfo] = await pool.query(
      `SELECT fc.categorie, YEAR(fs.date_session) AS annee, fe.cp_agent
       FROM formation_enrollment fe
       JOIN formation_session fs ON fs.id = fe.session_id
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       WHERE ${PRESENCE_REELLE}`
    );
    const repartition = {};
    const cle = (annee, categorie) => `${annee}|${categorie}`;
    viaAfo.forEach(r => {
      const k = cle(r.annee, r.categorie);
      if (!repartition[k]) repartition[k] = { annee: r.annee, categorie: r.categorie, agents: new Set() };
      repartition[k].agents.add(r.cp_agent);
    });
    // + source e-learning/externe, lue depuis donnees_json de chaque agent
    const [profils] = await pool.query(`SELECT cp_agent, donnees_json FROM profil_agent WHERE donnees_json IS NOT NULL`);
    profils.forEach(p => {
      const extra = typeof p.donnees_json === 'string' ? JSON.parse(p.donnees_json) : (p.donnees_json || {});
      (extra.formationsPersoDeclarees || []).forEach(f => {
        const annee = Number((f.date || '').slice(0, 4));
        if (!annee) return;
        const k = cle(annee, 'E-learning / externe');
        if (!repartition[k]) repartition[k] = { annee, categorie: 'E-learning / externe', agents: new Set() };
        repartition[k].agents.add(p.cp_agent);
      });
    });
    const parAnneeCategorieSource = Object.values(repartition)
      .map(r => ({ annee: r.annee, categorie: r.categorie, nbAgents: r.agents.size }))
      .sort((a, b) => b.annee - a.annee || a.categorie.localeCompare(b.categorie));

    // Stats par AFO — visibles par tous les AFO, pas seulement le sien.
    const [afos] = await pool.query(`SELECT a.cp, a.nom, a.prenom FROM agent a JOIN profil_agent pa ON pa.cp_agent=a.cp WHERE pa.is_afo=1 ORDER BY a.nom, a.prenom`);
    // 26/08 : duree_heures rapatriee ici pour le nouveau total "Heures" par
    // AFO (Olivier : "je veux dans les stat que chaque afo voit [...] le
    // nombre d'heure") -- champ optionnel du catalogue (0 si jamais renseigne
    // sur cette formation), jamais bloquant.
    const [sessionsFormateur] = await pool.query(
      `SELECT fsf.cp_agent AS cp_formateur, fs.id AS session_id, YEAR(fs.date_session) AS annee, fc.duree_heures
       FROM formation_session_formateur fsf
       JOIN formation_session fs ON fs.id = fsf.session_id
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id`
    );
    const [agentsFormateur] = await pool.query(
      `SELECT fsf.cp_agent AS cp_formateur, fs.catalogue_id, fc.intitule, fe.cp_agent AS cp_stagiaire
       FROM formation_session_formateur fsf
       JOIN formation_session fs ON fs.id = fsf.session_id
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       JOIN formation_enrollment fe ON fe.session_id = fs.id
       WHERE ${PRESENCE_REELLE}`
    );
    const parAfo = afos.map(afo => {
      const mesSessions = sessionsFormateur.filter(s => s.cp_formateur === afo.cp);
      const joursParAn = {};
      const heuresParAn = {};
      mesSessions.forEach(s => {
        joursParAn[s.annee] = (joursParAn[s.annee] || 0) + 1;
        heuresParAn[s.annee] = (heuresParAn[s.annee] || 0) + Number(s.duree_heures || 0);
      });
      const mesAgents = agentsFormateur.filter(a => a.cp_formateur === afo.cp);
      const parFormationMap = {};
      mesAgents.forEach(a => {
        if (!parFormationMap[a.catalogue_id]) parFormationMap[a.catalogue_id] = { catalogue_id: a.catalogue_id, intitule: a.intitule, agents: new Set() };
        parFormationMap[a.catalogue_id].agents.add(a.cp_stagiaire);
      });
      return {
        cp: afo.cp, nom: afo.nom, prenom: afo.prenom,
        nbSessions: mesSessions.length,
        joursParAn,
        heuresParAn,
        agentsFormesParFormation: Object.values(parFormationMap).map(f => ({ catalogue_id: f.catalogue_id, intitule: f.intitule, nbAgents: f.agents.size })),
        agentsFormesGlobal: new Set(mesAgents.map(a => a.cp_stagiaire)).size,
      };
    });

    res.json({ parFormation, parAnneeCategorieSource, parAfo });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// GET /formation/catalogue/:id/couverture — 26/08, demande par Olivier :
// "il faut qu'un puisse suivre en detail les agent deja forme, par date, et
// aussi ceux qui n'ont pas ete encore forme" (ex: 365 TRAVAUX, tous les
// agents doivent etre formes). Meme regle PRESENCE_REELLE que getStats (un
// agent qui decline une session lancee n'est jamais compte "forme"). Scope
// = tous les agents actifs (choix confirme par Olivier plutot qu'un filtre
// par famille PRCI/PAR -- il juge lui-meme qui est concerne).
async function getCouvertureFormation(req, res) {
  const { id } = req.params;
  try {
    const [[cat]] = await pool.query('SELECT id, intitule, categorie FROM formation_catalogue WHERE id=?', [id]);
    if (!cat) return res.status(404).json({ error: 'Formation introuvable' });

    const [formes] = await pool.query(
      `SELECT a.cp, a.nom, a.prenom, MAX(fs.date_session) AS derniere_date
       FROM formation_enrollment fe
       JOIN formation_session fs ON fs.id = fe.session_id
       JOIN agent a ON a.cp = fe.cp_agent
       WHERE fs.catalogue_id = ? AND ${PRESENCE_REELLE}
       GROUP BY a.cp, a.nom, a.prenom
       ORDER BY derniere_date DESC`,
      [id]
    );
    const cpFormes = formes.map(f => f.cp);
    const [nonFormes] = await pool.query(
      cpFormes.length
        ? `SELECT cp, nom, prenom FROM agent WHERE statut='actif' AND cp NOT IN (?) ORDER BY nom, prenom`
        : `SELECT cp, nom, prenom FROM agent WHERE statut='actif' ORDER BY nom, prenom`,
      cpFormes.length ? [cpFormes] : []
    );

    res.json({ catalogue: cat, formes, nonFormes });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = {
  getCatalogue, createCatalogue, updateCatalogue, deleteCatalogue,
  getSessions, getSessionDetail, createSession, updateSession, deleteSession,
  addFormateur, removeFormateur, addParticipant, removeParticipant, lancerSession,
  getMesSessions, getFormationsProposees, declarerFormationPerso, getStats,
  getCouvertureFormation,
};
