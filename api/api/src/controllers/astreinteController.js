const pool = require('../config/db');

// Module Astreinte (20/09) : voir add_astreinte.js pour le contexte complet.
// Aucune restriction admin sur ces endpoints -- même principe déjà établi
// pour l'import CPS Officiel ("n'importe quel agent connecté, pas de
// restriction admin", 09/07) : c'est une saisie collaborative, pas une
// donnée sensible.

async function getAgents(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom, prenom FROM astreinte_agent ORDER BY nom, prenom'
    );
    res.json(rows);
  } catch (err) {
    console.error('astreinte.getAgents:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function createAgent(req, res) {
  const nom = (req.body?.nom || '').toString().trim().slice(0, 60);
  const prenom = (req.body?.prenom || '').toString().trim().slice(0, 60);
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  try {
    const [result] = await pool.query(
      'INSERT INTO astreinte_agent (nom, prenom) VALUES (?, ?)',
      [nom, prenom]
    );
    res.json({ id: result.insertId, nom, prenom });
  } catch (err) {
    console.error('astreinte.createAgent:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function updateAgent(req, res) {
  const { id } = req.params;
  const nom = (req.body?.nom || '').toString().trim().slice(0, 60);
  const prenom = (req.body?.prenom || '').toString().trim().slice(0, 60);
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  try {
    await pool.query('UPDATE astreinte_agent SET nom=?, prenom=? WHERE id=?', [nom, prenom, id]);
    res.json({ id: Number(id), nom, prenom });
  } catch (err) {
    console.error('astreinte.updateAgent:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function deleteAgent(req, res) {
  const { id } = req.params;
  try {
    // ON DELETE SET NULL (astreinte_jour.astreinte_agent_id) : les jours déjà
    // assignés à cet agent retombent automatiquement à "Non renseigné".
    await pool.query('DELETE FROM astreinte_agent WHERE id=?', [id]);
    res.json({ message: 'Agent supprimé' });
  } catch (err) {
    console.error('astreinte.deleteAgent:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function getSchedule(req, res) {
  const { from, to } = req.query;
  try {
    let sql = `SELECT j.date_jour, j.astreinte_agent_id, a.nom, a.prenom
               FROM astreinte_jour j LEFT JOIN astreinte_agent a ON a.id = j.astreinte_agent_id`;
    const params = [];
    if (from && to) { sql += ' WHERE j.date_jour BETWEEN ? AND ?'; params.push(from, to); }
    sql += ' ORDER BY j.date_jour';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('astreinte.getSchedule:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

async function setJour(req, res) {
  const { date } = req.params;
  const astreinteAgentId = req.body?.astreinte_agent_id ?? null;
  try {
    await pool.query(
      `INSERT INTO astreinte_jour (date_jour, astreinte_agent_id, modifie_par)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE astreinte_agent_id=VALUES(astreinte_agent_id), modifie_par=VALUES(modifie_par)`,
      [date, astreinteAgentId, req.agent.cp]
    );
    res.json({ message: 'Astreinte enregistrée' });
  } catch (err) {
    console.error('astreinte.setJour:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Assigne toute une semaine d'astreinte (vendredi -> jeudi suivant, 7 jours),
// calculée cote serveur depuis N'IMPORTE QUELLE date du body (pas
// necessairement un vendredi) -- jamais confiance aveugle en une liste de
// dates envoyee par le client. Simplification actee avec Olivier (20/09) :
// le vendredi de bascule affiche directement le NOUVEL agent (jamais de
// case a cheval entre deux personnes) -- donc une "semaine" = exactement 7
// jours calendaires, du vendredi inclus au jeudi suivant inclus.
function vendrediDeLaSemaine(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=dim ... 5=ven, 6=sam
  const diff = (dow - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

async function setSemaine(req, res) {
  const { date } = req.body || {};
  const astreinteAgentId = req.body?.astreinte_agent_id ?? null;
  if (!date) return res.status(400).json({ error: 'Date requise' });
  const vendredi = vendrediDeLaSemaine(date);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(vendredi);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const d of dates) {
      await conn.query(
        `INSERT INTO astreinte_jour (date_jour, astreinte_agent_id, modifie_par)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE astreinte_agent_id=VALUES(astreinte_agent_id), modifie_par=VALUES(modifie_par)`,
        [d, astreinteAgentId, req.agent.cp]
      );
    }
    await conn.commit();
    res.json({ message: 'Semaine assignée', dates });
  } catch (err) {
    await conn.rollback();
    console.error('astreinte.setSemaine:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
}

module.exports = { getAgents, createAgent, updateAgent, deleteAgent, getSchedule, setJour, setSemaine };
