const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const pool   = require('../config/db');

// Emet le token + la session pour un agent deja authentifie (login normal ou
// creation de compte) — factorise pour eviter la duplication entre les deux.
async function issueSession(req, res, agent) {
  const payload = { cp: agent.cp, is_admin: !!agent.is_admin };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN||'30d' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const device = req.headers['x-device-type'] || 'desktop';
  const expiresAt = new Date(Date.now() + 8*60*60*1000);
  await pool.query('INSERT INTO session (cp_agent, token_hash, device, expires_at) VALUES (?,?,?,?)',
    [agent.cp, tokenHash, device, expiresAt]);
  await pool.query('UPDATE auth SET last_login = NOW() WHERE cp_agent = ?', [agent.cp]);
  res.json({ token, agent: { cp: agent.cp, nom: agent.nom, prenom: agent.prenom,
    grade: agent.grade, initiales: agent.initiales, is_admin: !!agent.is_admin, partage_previsionnel: !!agent.partage_previsionnel }});
}

async function login(req, res) {
  const { cp, pin } = req.body;
  if (!cp || !pin) return res.status(400).json({ error: 'CP et PIN requis' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN invalide (5 chiffres)' });
  try {
    const [rows] = await pool.query(
      `SELECT a.cp, a.nom, a.prenom, a.grade, a.initiales, a.partage_previsionnel, au.pin_hash, au.is_admin
       FROM agent a JOIN auth au ON au.cp_agent = a.cp WHERE a.cp = ?`, [cp]);
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const agent = rows[0];
    if (!agent.pin_hash) return res.status(401).json({ error: 'Compte sans PIN — première connexion' });
    const valid = await bcrypt.compare(pin, agent.pin_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    await issueSession(req, res, agent);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/auth/register -> creation du PIN initial d'un compte qui n'en a pas
// encore (l'agent l'a choisi et confirme deux fois cote frontend avant cet appel).
// Refuse si un PIN existe deja - dans ce cas c'est /login qu'il faut utiliser.
async function register(req, res) {
  const { cp, pin } = req.body;
  if (!cp || !pin) return res.status(400).json({ error: 'CP et PIN requis' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN invalide (4 chiffres)' });
  try {
    const [rows] = await pool.query(
      `SELECT a.cp, a.nom, a.prenom, a.grade, a.initiales, a.partage_previsionnel, au.pin_hash, au.is_admin
       FROM agent a JOIN auth au ON au.cp_agent = a.cp WHERE a.cp = ?`, [cp]);
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const agent = rows[0];
    if (agent.pin_hash) return res.status(409).json({ error: 'Ce compte a déjà un PIN — utilise la connexion normale' });
    await pool.query('UPDATE auth SET pin_hash = ? WHERE cp_agent = ?', [await bcrypt.hash(pin, 12), cp]);
    await issueSession(req, res, agent);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

async function logout(req, res) {
  const header = req.headers['authorization'];
  if (!header) return res.status(200).json({ message: 'Déconnecté' });
  const tokenHash = crypto.createHash('sha256').update(header.slice(7)).digest('hex');
  await pool.query('DELETE FROM session WHERE token_hash = ?', [tokenHash]);
  res.json({ message: 'Déconnecté' });
}

async function changePin(req, res) {
  const { pin_actuel, pin_nouveau } = req.body;
  const cp = req.agent.cp;
  if (!pin_actuel || !pin_nouveau) return res.status(400).json({ error: 'PINs requis' });
  if (!/^\d{4}$/.test(pin_nouveau)) return res.status(400).json({ error: 'PIN invalide (4 chiffres)' });
  try {
    const [rows] = await pool.query('SELECT pin_hash FROM auth WHERE cp_agent = ?', [cp]);
    if (!rows.length) return res.status(404).json({ error: 'Agent introuvable' });
    const valid = await bcrypt.compare(pin_actuel, rows[0].pin_hash);
    if (!valid) return res.status(401).json({ error: 'PIN actuel incorrect' });
    const hash = await bcrypt.hash(pin_nouveau, 12);
    await pool.query('UPDATE auth SET pin_hash = ? WHERE cp_agent = ?', [hash, cp]);
    const tokenHash = crypto.createHash('sha256').update(req.headers['authorization'].slice(7)).digest('hex');
    await pool.query('DELETE FROM session WHERE cp_agent = ? AND token_hash != ?', [cp, tokenHash]);
    res.json({ message: 'PIN modifié' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { login, logout, changePin, register };
