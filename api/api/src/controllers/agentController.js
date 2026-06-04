const pool = require('../config/db');
const { encrypt, decrypt } = require('../utils/crypto');

async function getAll(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT a.cp, a.nom, a.prenom, a.grade, a.initiales, af.famille, af.type_affectation
       FROM agent a LEFT JOIN agent_famille af ON af.cp_agent = a.cp AND af.date_fin IS NULL
       ORDER BY a.nom, a.prenom`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

async function getOne(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  try {
    const [rows] = await pool.query('SELECT * FROM agent WHERE cp = ?', [cp]);
    if (!rows.length) return res.status(404).json({ error: 'Agent introuvable' });
    const a = rows[0];
    if (a.email)     a.email     = decrypt(a.email);
    if (a.telephone) a.telephone = decrypt(a.telephone);
    res.json(a);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

async function update(req, res) {
  const { cp } = req.params;
  if (req.agent.cp !== cp && !req.agent.is_admin)
    return res.status(403).json({ error: 'Accès refusé' });
  const { email, telephone, grade } = req.body;
  const fields = [], values = [];
  if (email !== undefined)     { fields.push('email = ?');     values.push(encrypt(email)); }
  if (telephone !== undefined) { fields.push('telephone = ?'); values.push(encrypt(telephone)); }
  if (grade !== undefined && req.agent.is_admin) { fields.push('grade = ?'); values.push(grade); }
  if (!fields.length) return res.status(400).json({ error: 'Rien à modifier' });
  values.push(cp);
  try {
    await pool.query(`UPDATE agent SET ${fields.join(', ')} WHERE cp = ?`, values);
    res.json({ message: 'Profil mis à jour' });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getAll, getOne, update };
