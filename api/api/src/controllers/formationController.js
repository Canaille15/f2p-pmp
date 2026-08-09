const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Helpers d'écriture/lecture du planning perso (partagés par lancerSession,
// addParticipant et l'auto-déclaration) — jamais d'écrasement : un jour
// n'est touché que s'il est réellement vide (aucune ligne planning_periode).
// ─────────────────────────────────────────────────────────────────────────

async function joursOccupe(conn, cp_agent, date_jour) {
  const [rows] = await conn.query(
    `SELECT pp.code_equipe
     FROM planning_jour pj
     LEFT JOIN planning_periode pp ON pp.planning_jour_id = pj.id
     WHERE pj.cp_agent = ? AND pj.date_jour = ?`,
    [cp_agent, date_jour]
  );
  if (!rows.length) return null; // aucune ligne planning_jour -> vide
  const codes = rows.map(r => r.code_equipe).filter(Boolean);
  return codes.length ? codes : null; // ligne planning_jour existante mais sans periode -> vide
}

async function essayerEcrireFor(conn, cp_agent, date_jour, note) {
  const occupe = await joursOccupe(conn, cp_agent, date_jour);
  if (occupe) return { ok: false, code_existant: occupe.join('+') };
  await conn.query(
    `INSERT INTO planning_jour (cp_agent, date_jour, source) VALUES (?,?,'manuel')
     ON DUPLICATE KEY UPDATE modifie_le = NOW()`,
    [cp_agent, date_jour]
  );
  const [[jour]] = await conn.query(
    'SELECT id FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp_agent, date_jour]
  );
  await conn.query(
    `INSERT INTO planning_periode (planning_jour_id, ordre, code_equipe, prive, note)
     VALUES (?, 1, 'FOR', 0, ?)`,
    [jour.id, note || null]
  );
  return { ok: true };
}

// Retire l'ecriture FOR faite pour cette formation, mais UNIQUEMENT si le
// jour contient encore exactement ce qu'on y avait mis (une seule periode,
// code FOR) — si l'agent a modifie/complete le jour depuis, on ne touche a
// rien (meme principe que "Annuler" sur VT/CET).
async function essayerEffacerForSiIntact(conn, cp_agent, date_jour) {
  const [rows] = await conn.query(
    `SELECT pp.id, pp.code_equipe
     FROM planning_jour pj
     JOIN planning_periode pp ON pp.planning_jour_id = pj.id
     WHERE pj.cp_agent = ? AND pj.date_jour = ?`,
    [cp_agent, date_jour]
  );
  if (rows.length === 1 && rows[0].code_equipe === 'FOR') {
    await conn.query('DELETE FROM planning_jour WHERE cp_agent=? AND date_jour=?', [cp_agent, date_jour]);
    return true;
  }
  return false;
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
  const { categorie, intitule, description, duree, format, public_cible, prerequis, obligatoire } = req.body;
  if (!categorie || !intitule) return res.status(400).json({ error: 'Catégorie et intitulé requis' });
  try {
    const [result] = await pool.query(
      `INSERT INTO formation_catalogue (categorie, intitule, description, duree, format, public_cible, prerequis, obligatoire, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [categorie, intitule, description || null, duree || null, format || null, public_cible || null, prerequis || null, obligatoire ? 1 : 0, req.agent.cp]
    );
    res.status(201).json({ message: 'Formation créée', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function updateCatalogue(req, res) {
  const { id } = req.params;
  const { categorie, intitule, description, duree, format, public_cible, prerequis, obligatoire, statut } = req.body;
  const fields = [], values = [];
  if (categorie !== undefined)     { fields.push('categorie = ?');     values.push(categorie); }
  if (intitule !== undefined)      { fields.push('intitule = ?');      values.push(intitule); }
  if (description !== undefined)   { fields.push('description = ?');   values.push(description || null); }
  if (duree !== undefined)         { fields.push('duree = ?');         values.push(duree || null); }
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

async function getSessions(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT fs.*, fc.intitule, fc.categorie,
              (SELECT COUNT(*) FROM formation_enrollment fe WHERE fe.session_id = fs.id) AS nb_participants,
              (SELECT GROUP_CONCAT(af.cp) FROM formation_session_formateur fsf JOIN agent af ON af.cp = fsf.cp_agent WHERE fsf.session_id = fs.id) AS formateurs_cp
       FROM formation_session fs
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       ORDER BY fs.date_session DESC`
    );
    res.json(rows);
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
  const { catalogue_id, date_session, lieu, message_lancement, formateurs, participants } = req.body;
  if (!catalogue_id || !date_session) return res.status(400).json({ error: 'catalogue_id et date_session requis' });
  if (formateurs && formateurs.length > 3) return res.status(400).json({ error: 'Jusqu\'à 3 formateurs maximum' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO formation_session (catalogue_id, date_session, lieu, message_lancement, cp_agent_creation)
       VALUES (?,?,?,?,?)`,
      [catalogue_id, date_session, lieu || null, message_lancement || null, req.agent.cp]
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
  const { lieu, message_lancement, date_session, statut } = req.body;
  try {
    const [[session]] = await pool.query('SELECT statut, date_session FROM formation_session WHERE id=?', [id]);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (date_session !== undefined && date_session !== session.date_session && session.statut !== 'planifiee') {
      return res.status(400).json({ error: 'La date ne peut plus changer une fois la session lancée (le planning des participants a déjà été écrit pour la date initiale).' });
    }
    const fields = [], values = [];
    if (lieu !== undefined)              { fields.push('lieu = ?');              values.push(lieu || null); }
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

    let ecrit = null;
    // Si la session a deja ete lancee, ce nouveau participant doit recevoir
    // le meme traitement immediatement (ecriture planning + notification) —
    // sinon il n'aurait ni FOR dans son planning, ni signal de nouveaute.
    if (session.statut === 'lancee') {
      const [[cat]] = await conn.query('SELECT intitule FROM formation_catalogue WHERE id=?', [session.catalogue_id]);
      const resultat = await essayerEcrireFor(conn, cp_agent, session.date_session, `Formation : ${cat.intitule}`);
      ecrit = resultat.ok;
      if (resultat.ok) {
        await materialiserNotification(conn, cp_agent, {
          enrollmentId: `${id}-${cp_agent}`, sessionId: Number(id),
          titre: `🎓 Nouvelle formation : ${cat.intitule}`,
          dateSession: session.date_session, lieu: session.lieu,
          message: session.message_lancement || null, acquitte: false,
        });
      }
    }
    await conn.commit();
    res.status(201).json({ message: 'Participant ajouté', ecrit });
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
    // Nettoyer le planning seulement si le jour contient encore exactement
    // ce qui a ete ecrit pour cette formation (meme principe que "Annuler"
    // sur VT/CET) — jamais si l'agent a modifie/complete le jour depuis.
    await essayerEffacerForSiIntact(conn, cp, session.date_session);
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
      await essayerEffacerForSiIntact(conn, p.cp_agent, session.date_session);
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

    const succes = [], bloques = [];
    for (const agent of enrollments) {
      const resultat = await essayerEcrireFor(conn, agent.cp_agent, session.date_session, `Formation : ${session.intitule}`);
      if (resultat.ok) {
        succes.push({ cp_agent: agent.cp_agent, nom: agent.nom, prenom: agent.prenom });
        await materialiserNotification(conn, agent.cp_agent, {
          enrollmentId: `${id}-${agent.cp_agent}`, sessionId: Number(id),
          titre: `🎓 Nouvelle formation : ${session.intitule}`,
          dateSession: session.date_session, lieu: session.lieu,
          message: message ?? session.message_lancement ?? null, acquitte: false,
        });
      } else {
        bloques.push({ cp_agent: agent.cp_agent, nom: agent.nom, prenom: agent.prenom, code_existant: resultat.code_existant });
      }
    }

    const fields = [`statut = 'lancee'`, `lancee_le = NOW()`];
    const values = [];
    if (message !== undefined) { fields.push('message_lancement = ?'); values.push(message || null); }
    values.push(id);
    await conn.query(`UPDATE formation_session SET ${fields.join(', ')} WHERE id = ?`, values);

    await conn.commit();
    res.json({ message: 'Session lancée', succes, bloques });
  } catch (e) {
    await conn.rollback();
    console.error(e); res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

// ─────────────────────────────────────────────────────────────────────────
// Vue agent — "Mes formations" (sessions AFO où l'agent connecté est inscrit)
// ─────────────────────────────────────────────────────────────────────────

async function getMesSessions(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT fs.id, fs.date_session, fs.lieu, fs.statut, fs.message_lancement,
              fc.intitule, fc.categorie, fe.inscrit_le
       FROM formation_enrollment fe
       JOIN formation_session fs ON fs.id = fe.session_id
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       WHERE fe.cp_agent = ?
       ORDER BY fs.date_session DESC`,
      [req.agent.cp]
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
    const resultat = await essayerEcrireFor(conn, req.agent.cp, date, `Formation : ${intitule}`);
    if (!resultat.ok) {
      await conn.rollback();
      return res.status(400).json({ error: `Le ${date} contient déjà "${resultat.code_existant}" dans ton planning perso. Modifie ou efface ce jour d'abord.` });
    }
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
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id`
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
    const [sessionsFormateur] = await pool.query(
      `SELECT fsf.cp_agent AS cp_formateur, fs.id AS session_id, YEAR(fs.date_session) AS annee
       FROM formation_session_formateur fsf JOIN formation_session fs ON fs.id = fsf.session_id`
    );
    const [agentsFormateur] = await pool.query(
      `SELECT fsf.cp_agent AS cp_formateur, fs.catalogue_id, fc.intitule, fe.cp_agent AS cp_stagiaire
       FROM formation_session_formateur fsf
       JOIN formation_session fs ON fs.id = fsf.session_id
       JOIN formation_catalogue fc ON fc.id = fs.catalogue_id
       JOIN formation_enrollment fe ON fe.session_id = fs.id`
    );
    const parAfo = afos.map(afo => {
      const mesSessions = sessionsFormateur.filter(s => s.cp_formateur === afo.cp);
      const joursParAn = {};
      mesSessions.forEach(s => { joursParAn[s.annee] = (joursParAn[s.annee] || 0) + 1; });
      const mesAgents = agentsFormateur.filter(a => a.cp_formateur === afo.cp);
      const parFormationMap = {};
      mesAgents.forEach(a => {
        if (!parFormationMap[a.catalogue_id]) parFormationMap[a.catalogue_id] = { catalogue_id: a.catalogue_id, intitule: a.intitule, agents: new Set() };
        parFormationMap[a.catalogue_id].agents.add(a.cp_stagiaire);
      });
      return {
        cp: afo.cp, nom: afo.nom, prenom: afo.prenom,
        joursParAn,
        agentsFormesParFormation: Object.values(parFormationMap).map(f => ({ catalogue_id: f.catalogue_id, intitule: f.intitule, nbAgents: f.agents.size })),
        agentsFormesGlobal: new Set(mesAgents.map(a => a.cp_stagiaire)).size,
      };
    });

    res.json({ parFormation, parAnneeCategorieSource, parAfo });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = {
  getCatalogue, createCatalogue, updateCatalogue, deleteCatalogue,
  getSessions, getSessionDetail, createSession, updateSession, deleteSession,
  addFormateur, removeFormateur, addParticipant, removeParticipant, lancerSession,
  getMesSessions, declarerFormationPerso, getStats,
};
