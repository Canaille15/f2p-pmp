const pool = require('../config/db');
const { decrypt } = require('../utils/crypto');

// ─── AGENTS (lecture seule, filtrés sur annuaire_visible) ────────────────────
// Expose email/telephone déchiffrés à TOUT agent connecté (contrairement à
// agentController.getOne qui est restreint à soi-même/admin). Choix produit
// assumé le 04/07/2026 : un agent peut désactiver sa visibilité via le toggle
// "Visible dans l'annuaire" (annuaire_visible=0).
// Déchiffre en toute sécurité : une donnée illisible (ex: chiffrée avec une
// clé de chiffrement antérieure à une rotation) ne doit jamais faire planter
// tout l'annuaire — elle est traitée comme "non communiquée" pour cette seule
// ligne, sans bloquer les autres agents.
function decryptSafe(value) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch (e) {
    console.error('Déchiffrement impossible pour une valeur (donnée conservée illisible, probablement une clé de chiffrement antérieure) :', e.message);
    return null;
  }
}

async function getAgentsVisibles(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT cp, nom, prenom, grade, fonction, email, telephone
       FROM agent
       WHERE annuaire_visible = 1
       ORDER BY nom, prenom`
    );
    const agentsList = rows.map(a => ({
      ...a,
      email: decryptSafe(a.email),
      telephone: decryptSafe(a.telephone),
    }));
    res.json(agentsList);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── UO (unités opérationnelles) ──────────────────────────────────────────────
// Fiches par POSTE/FONCTION (ex: "Assistant RH"), pas par personne — le
// titulaire actuel n'est qu'une info affichée dessus, à mettre à jour lors
// des mutations. Modifiable par TOUT agent connecté (choix produit du
// 04/07/2026, comme pour l'Accès rapide) — pas de restriction admin ici.
async function getUo(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM annuaire_uo ORDER BY fonction');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createUo(req, res) {
  const { fonction, titulaire_nom, titulaire_prenom, mobile_perso, mobile_pro, fixe, email, note } = req.body;
  if (!fonction) return res.status(400).json({ error: 'Le poste/fonction est obligatoire' });
  try {
    const [result] = await pool.query(
      `INSERT INTO annuaire_uo
         (fonction, titulaire_nom, titulaire_prenom, mobile_perso, mobile_pro, fixe, email, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      [fonction, titulaire_nom || null, titulaire_prenom || null,
       mobile_perso || null, mobile_pro || null, fixe || null, email || null, note || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateUo(req, res) {
  const { id } = req.params;
  const { fonction, titulaire_nom, titulaire_prenom, mobile_perso, mobile_pro, fixe, email, note } = req.body;
  const fields = [], values = [];
  if (fonction !== undefined)         { fields.push('fonction = ?');         values.push(fonction); }
  if (titulaire_nom !== undefined)    { fields.push('titulaire_nom = ?');    values.push(titulaire_nom || null); }
  if (titulaire_prenom !== undefined) { fields.push('titulaire_prenom = ?'); values.push(titulaire_prenom || null); }
  if (mobile_perso !== undefined)     { fields.push('mobile_perso = ?');     values.push(mobile_perso || null); }
  if (mobile_pro !== undefined)       { fields.push('mobile_pro = ?');       values.push(mobile_pro || null); }
  if (fixe !== undefined)             { fields.push('fixe = ?');             values.push(fixe || null); }
  if (email !== undefined)            { fields.push('email = ?');            values.push(email || null); }
  if (note !== undefined)             { fields.push('note = ?');             values.push(note || null); }
  if (!fields.length) return res.status(400).json({ error: 'Rien à modifier' });
  values.push(id);
  try {
    const [result] = await pool.query(
      `UPDATE annuaire_uo SET ${fields.join(', ')}, modifie_le = NOW() WHERE id = ?`,
      values
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Fiche introuvable' });
    res.json({ message: 'Fiche mise à jour' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteUo(req, res) {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM annuaire_uo WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Fiche introuvable' });
    res.json({ message: 'Fiche supprimée' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── ACCÈS RAPIDE ─────────────────────────────────────────────────────────────
// Petite liste de numéros (ex: Astreinte) — modifiable par tout agent connecté.
async function getAccesRapide(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM annuaire_acces_rapide ORDER BY id');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createAccesRapide(req, res) {
  const { libelle, numero } = req.body;
  if (!libelle || !numero) return res.status(400).json({ error: 'Libellé et numéro sont obligatoires' });
  try {
    const [result] = await pool.query(
      'INSERT INTO annuaire_acces_rapide (libelle, numero) VALUES (?,?)',
      [libelle, numero]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateAccesRapide(req, res) {
  const { id } = req.params;
  const { libelle, numero } = req.body;
  const fields = [], values = [];
  if (libelle !== undefined) { fields.push('libelle = ?'); values.push(libelle); }
  if (numero !== undefined)  { fields.push('numero = ?');  values.push(numero); }
  if (!fields.length) return res.status(400).json({ error: 'Rien à modifier' });
  values.push(id);
  try {
    const [result] = await pool.query(
      `UPDATE annuaire_acces_rapide SET ${fields.join(', ')}, modifie_le = NOW() WHERE id = ?`,
      values
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Entrée introuvable' });
    res.json({ message: 'Mis à jour' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteAccesRapide(req, res) {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM annuaire_acces_rapide WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Entrée introuvable' });
    res.json({ message: 'Supprimé' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getAgentsVisibles,
  getUo, createUo, updateUo, deleteUo,
  getAccesRapide, createAccesRapide, updateAccesRapide, deleteAccesRapide,
};
