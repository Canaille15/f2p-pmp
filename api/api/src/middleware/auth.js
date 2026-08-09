const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const crypto = require('crypto');

async function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });
  const token = header.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    // is_admin et is_afo sont relus en base a chaque requete (pas depuis le JWT) :
    // sinon une promotion/retrait ne prend effet qu'a la prochaine reconnexion
    // de l'agent concerne, jusqu'a expiration de son token (30j).
    const [rows] = await pool.query(
      `SELECT s.id, au.is_admin, pa.is_afo
       FROM session s
       JOIN auth au ON au.cp_agent = s.cp_agent
       LEFT JOIN profil_agent pa ON pa.cp_agent = s.cp_agent
       WHERE s.cp_agent = ? AND s.token_hash = ? AND s.expires_at > NOW()`,
      [payload.cp, tokenHash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Session expirée' });
    req.agent = { cp: payload.cp, is_admin: !!rows[0].is_admin, is_afo: !!rows[0].is_afo };
    next();
  } catch (e) {
    // Erreur DB (ex: coupure de connexion Railway, ECONNRESET deja vu plusieurs
    // fois) - distincte d'un vrai token invalide. On renvoie 500 plutot que 401
    // pour que le frontend ne traite pas ca comme une session expiree (qui
    // efface le token et force une reconnexion pour un simple couac
    // d'infrastructure passager, alors que le token etait parfaitement valide).
    console.error('Erreur DB dans authMiddleware:', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.agent?.is_admin)
    return res.status(403).json({ error: 'Accès admin requis' });
  next();
}

function afoMiddleware(req, res, next) {
  if (!req.agent?.is_afo)
    return res.status(403).json({ error: 'Accès formateur (AFO) requis' });
  next();
}

module.exports = { authMiddleware, adminMiddleware, afoMiddleware };
