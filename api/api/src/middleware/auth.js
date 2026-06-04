const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto');

async function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.query(
      'SELECT id FROM session WHERE cp_agent = ? AND token_hash = ? AND expires_at > NOW()',
      [payload.cp, tokenHash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Session expirée' });
    req.agent = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.agent?.is_admin)
    return res.status(403).json({ error: 'Accès admin requis' });
  next();
}

module.exports = { authMiddleware, adminMiddleware };
