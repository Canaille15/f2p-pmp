const pool = require('../config/db');
const { encrypt, decrypt } = require('../utils/crypto');
const bcrypt = require('bcrypt');
const { sweepAllDue } = require('../utils/departSweep');

// ─── GET ALL ──────────────────────────────────────────────────────────────────
async function getAll(req, res) {
  try {
    // Applique d'abord tout départ programmé arrivé à échéance (date_depart
    // <= aujourd'hui) -- sans ça, un agent dont la date est passée resterait
    // affiché "actif" tant que personne ne s'est reconnecté depuis. Non
    // bloquant : une erreur ici ne doit jamais empêcher la liste de charger.
    await sweepAllDue().catch(e => console.error('sweepAllDue (getAll):', e));
    const [rows] = await pool.query(
      `SELECT a.cp, a.nom, a.prenom, a.grade, a.initiales, a.partage_previsionnel,
              a.statut, a.date_depart, a.date_embauche,
              pa.familles_hab AS famille,
              pa.is_reserve,
              pa.is_afo,
              pa.is_dpx,
              pa.is_adjoint_dpx,
              au.is_admin,
              au.pin_hash IS NOT NULL AS has_pin,
              (SELECT rh.type_roulement FROM roulement_historique rh
                WHERE rh.cp_agent = a.cp AND rh.date_fin IS NULL
                ORDER BY rh.date_debut DESC LIMIT 1) AS type_roulement
       FROM agent a
       LEFT JOIN profil_agent pa ON pa.cp_agent = a.cp
       LEFT JOIN auth au ON au.cp_agent = a.cp
       ORDER BY a.nom, a.prenom`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── GET ONE ──────────────────────────────────────────────────────────────────
async function getOne(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [rows] = await pool.query('SELECT * FROM agent WHERE cp = ?', [cp]);
    if (!rows.length) return res.status(404).json({ error: 'Agent introuvable' });
    const a = rows[0];
    // Déchiffrement protégé : une valeur illisible (ex: chiffrée avec une
    // clé antérieure à une rotation de sécurité) ne doit jamais faire
    // planter la requête entière — elle devient simplement null.
    const decryptSafe = (v) => { try { return v ? decrypt(v) : v; } catch (e) { console.error('Déchiffrement impossible (donnée conservée illisible) :', e.message); return null; } };
    a.email     = decryptSafe(a.email);
    a.telephone = decryptSafe(a.telephone);
    res.json(a);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
async function update(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { email, telephone, fonction, grade, nom, prenom, poste, partage_previsionnel, annuaire_visible, pdf_annuaire_visible, famille, nouveau_cp, is_admin, is_reserve, is_afo, is_dpx, is_adjoint_dpx, date_embauche } = req.body;
  const fields = [], values = [];
  if (email !== undefined)     { fields.push('email = ?');     values.push(encrypt(email)); }
  if (telephone !== undefined) { fields.push('telephone = ?'); values.push(encrypt(telephone)); }
  if (fonction !== undefined)  { fields.push('fonction = ?');  values.push(fonction || null); }
  if (partage_previsionnel !== undefined) { fields.push('partage_previsionnel = ?'); values.push(partage_previsionnel ? 1 : 0); }
  // date_embauche (10/09) : admin-only, symétrique de date_depart -- permet
  // à Stat'Equip de reconstruire l'effectif réel d'une année passée (voir
  // computeAgeMoyenAnnee). Chaîne vide envoyée volontairement pour effacer
  // une date déjà saisie (retour à NULL = "présent depuis toujours").
  if (req.agent.is_admin && date_embauche !== undefined) {
    fields.push('date_embauche = ?');
    values.push(date_embauche || null);
  }
  if (annuaire_visible !== undefined) { fields.push('annuaire_visible = ?'); values.push(annuaire_visible ? 1 : 0); }
  // pdf_annuaire_visible (29/08) : "Visible sur l'annuaire téléphonique
  // imprimé (PDF)" -- indépendant d'annuaire_visible (self-service, même
  // permission -- soi-même ou admin, cf. le garde-fou en tête de fonction).
  if (pdf_annuaire_visible !== undefined) { fields.push('pdf_annuaire_visible = ?'); values.push(pdf_annuaire_visible ? 1 : 0); }
  if (req.agent.is_admin) {
    if (grade  !== undefined) { fields.push('grade = ?');  values.push(grade); }
    if (nom    !== undefined) { fields.push('nom = ?');    values.push(nom); }
    if (prenom !== undefined) { fields.push('prenom = ?'); values.push(prenom); }
    if (poste  !== undefined) { fields.push('poste = ?');  values.push(poste); }
  }
  if (!fields.length && famille === undefined && is_admin === undefined && is_reserve === undefined && is_afo === undefined && is_dpx === undefined && is_adjoint_dpx === undefined) return res.status(400).json({ error: 'Rien à modifier' });
  values.push(cp);
  try {
    if (fields.length) {
      await pool.query(`UPDATE agent SET ${fields.join(', ')} WHERE cp = ?`, values);
    }
    if (req.agent.is_admin && famille !== undefined) {
      await pool.query('UPDATE profil_agent SET familles_hab = ? WHERE cp_agent = ?', [famille, cp]);
    }
    if (req.agent.is_admin && is_reserve !== undefined) {
      await pool.query('UPDATE profil_agent SET is_reserve = ? WHERE cp_agent = ?', [is_reserve ? 1 : 0, cp]);
    }
    if (req.agent.is_admin && is_afo !== undefined) {
      await pool.query('UPDATE profil_agent SET is_afo = ? WHERE cp_agent = ?', [is_afo ? 1 : 0, cp]);
    }
    if (req.agent.is_admin && is_dpx !== undefined) {
      await pool.query('UPDATE profil_agent SET is_dpx = ? WHERE cp_agent = ?', [is_dpx ? 1 : 0, cp]);
    }
    if (req.agent.is_admin && is_adjoint_dpx !== undefined) {
      await pool.query('UPDATE profil_agent SET is_adjoint_dpx = ? WHERE cp_agent = ?', [is_adjoint_dpx ? 1 : 0, cp]);
    }
    if (req.agent.is_admin && is_admin !== undefined) {
      await pool.query('UPDATE auth SET is_admin = ? WHERE cp_agent = ?', [is_admin ? 1 : 0, cp]);
    }
    let cpFinal = cp;
    if (req.agent.is_admin && nouveau_cp !== undefined && nouveau_cp.toUpperCase() !== cp) {
      cpFinal = nouveau_cp.toUpperCase();
      await pool.query('UPDATE agent SET cp = ? WHERE cp = ?', [cpFinal, cp]);
    }
    res.json({ message: 'Agent mis a jour', cp: cpFinal });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Ce CP existe deja pour un autre agent' });
    }
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── CREATE (admin) ───────────────────────────────────────────────────────────
async function create(req, res) {
  const { cp, nom, prenom, grade, poste, famille, is_reserve, is_afo } = req.body;
  if (!cp || !nom || !prenom)
    return res.status(400).json({ error: 'CP, nom et prénom sont obligatoires' });
  // agent.grade est NOT NULL en base -- le formulaire Admin envoie toujours
  // une valeur par défaut ("CO5"), donc ce cas n'est normalement jamais
  // atteignable depuis l'UI, mais un appel API direct sans grade plantait
  // en 500 générique au lieu d'un message clair (trouvé le 25/08).
  if (!grade)
    return res.status(400).json({ error: 'Le grade est obligatoire' });

  // Initiales automatiques
  const initiales = (prenom[0] + (nom.replace(/[\s-]/g, '')[0] || '')).toUpperCase();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Créer l'agent
    await conn.query(
      `INSERT INTO agent (cp, nom, prenom, grade, initiales) VALUES (?, ?, ?, ?, ?)`,
      [cp.toUpperCase(), nom.toUpperCase(), prenom, grade || null, initiales]
    );

    // Créer le profil
    await conn.query(
      `INSERT INTO profil_agent (cp_agent, is_reserve, is_afo, familles_hab) VALUES (?, ?, ?, ?)`,
      [cp.toUpperCase(), is_reserve ? 1 : 0, is_afo ? 1 : 0, famille || 'PRCI']
    );

    // Créer l'entrée auth (sans PIN — l'agent le créera à la première connexion)
    await conn.query(
      `INSERT INTO auth (cp_agent, pin_hash, is_admin) VALUES (?, NULL, 0)`,
      [cp.toUpperCase()]
    );

    await conn.commit();
    res.status(201).json({ message: 'Agent créé', cp: cp.toUpperCase() });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Ce CP existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
}

// ─── DELETE (admin) ───────────────────────────────────────────────────────────
async function remove(req, res) {
  const { cp } = req.params;

  // Sécurité — impossible de supprimer son propre compte
  if (req.agent.cp === cp)
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Supprimer dans l'ordre (clés étrangères)
    await conn.query('DELETE FROM planning_periode WHERE planning_jour_id IN (SELECT id FROM planning_jour WHERE cp_agent = ?)', [cp]);
    await conn.query('DELETE FROM planning_jour WHERE cp_agent = ?', [cp]);
    await conn.query('DELETE FROM profil_agent WHERE cp_agent = ?', [cp]);
    await conn.query('DELETE FROM auth WHERE cp_agent = ?', [cp]);
    await conn.query('DELETE FROM agent WHERE cp = ?', [cp]);

    await conn.commit();
    res.json({ message: 'Agent supprimé' });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
}

// ─── DÉPART (admin) ───────────────────────────────────────────────────────────
// Remplace la suppression physique pour un départ normal : vide le planning
// strictement après date_depart (le prévisionnel oublié par l'agent, qui
// pourrait sinon polluer le Planning Prévisionnel partagé), garde tout
// jusqu'à cette date inclus, et bloque la connexion via statut='quitte' —
// sans jamais cascade-supprimer l'historique (formations, échanges, CPS...).
//
// Départ PROGRAMMÉ (11/09, demande d'Olivier) : si la date choisie est dans
// le futur, rien de ce qui précède ne s'applique tout de suite -- l'agent
// reste 'actif' normalement (connexion possible, planning intact), seule
// date_depart est enregistrée. Le blocage + le nettoyage du planning ne
// s'appliquent automatiquement QU'UNE FOIS la date atteinte, via le sweep
// (voir utils/departSweep.js, déclenché à la connexion et à l'ouverture du
// panneau Admin -- aucun cron nécessaire). Rappeler ce même endpoint avec une
// nouvelle date remplace la date programmée (report/anticipation), tant que
// l'agent n'est pas encore 'quitte'.
async function depart(req, res) {
  const { cp } = req.params;
  const { date_depart } = req.body;

  if (req.agent.cp === cp)
    return res.status(400).json({ error: 'Impossible de marquer votre propre compte comme quitté' });
  if (!date_depart)
    return res.status(400).json({ error: 'date_depart requise' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[{ due }]] = await conn.query('SELECT (? <= CURDATE()) AS due', [date_depart]);

    if (!due) {
      // Départ programmé pour plus tard : aucun effet immédiat, juste la date.
      await conn.query('UPDATE agent SET statut = ?, date_depart = ? WHERE cp = ?', ['actif', date_depart, cp]);
      await conn.commit();
      return res.json({
        message: `Départ programmé pour le ${date_depart} — aucun effet avant cette date (planning et connexion inchangés)`,
        effectif: false,
      });
    }

    // Date déjà atteinte (aujourd'hui ou passée) : appliqué immédiatement,
    // comportement historique inchangé.
    await conn.query(
      `DELETE FROM planning_periode WHERE planning_jour_id IN
        (SELECT id FROM planning_jour WHERE cp_agent = ? AND date_jour > ?)`,
      [cp, date_depart]
    );
    await conn.query('DELETE FROM planning_jour WHERE cp_agent = ? AND date_jour > ?', [cp, date_depart]);
    await conn.query('UPDATE agent SET statut = ?, date_depart = ? WHERE cp = ?', ['quitte', date_depart, cp]);

    await conn.commit();
    res.json({ message: 'Agent marqué comme quitté, planning vidé au-delà du ' + date_depart, effectif: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    conn.release();
  }
}

// ─── ANNULER UN DÉPART PROGRAMMÉ (admin) ──────────────────────────────────────
// Distinct de réactiver() : ici l'agent n'est jamais devenu 'quitte' (date
// encore dans le futur au moment de l'annulation) -- efface juste date_depart,
// rien d'autre à défaire (aucun planning n'a été touché, aucune connexion
// n'a jamais été bloquée). Pour un départ déjà EFFECTIF (statut='quitte'),
// c'est réactiver() qu'il faut utiliser (gère aussi le planning déjà vidé).
async function annulerDepartProgramme(req, res) {
  const { cp } = req.params;
  try {
    const [result] = await pool.query(
      `UPDATE agent SET date_depart = NULL WHERE cp = ? AND statut = 'actif'`,
      [cp]
    );
    if (result.affectedRows === 0)
      return res.status(400).json({ error: 'Aucun départ programmé à annuler pour cet agent (déjà quitté ou introuvable)' });
    res.json({ message: 'Départ programmé annulé' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── RÉACTIVER (admin) ────────────────────────────────────────────────────────
async function reactiver(req, res) {
  const { cp } = req.params;
  try {
    const [result] = await pool.query(`UPDATE agent SET statut = 'actif', date_depart = NULL WHERE cp = ?`, [cp]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Agent introuvable' });
    res.json({ message: 'Agent réactivé' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── RESET PIN (admin) ────────────────────────────────────────────────────────
async function resetPin(req, res) {
  const { cp } = req.params;
  const { newPin } = req.body;

  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin))
    return res.status(400).json({ error: 'Le PIN doit être 4 chiffres' });

  try {
    const hash = await bcrypt.hash(newPin, 10);
    const [result] = await pool.query(
      'UPDATE auth SET pin_hash = ? WHERE cp_agent = ?',
      [hash, cp]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Agent introuvable' });
    res.json({ message: 'PIN réinitialisé' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getAll, getOne, update, create, remove, resetPin, depart, reactiver, annulerDepartProgramme };
