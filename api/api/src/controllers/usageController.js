const pool = require('../config/db');

// Un agent qui reste ouvert sur la même vue plusieurs jours ne doit pas la
// faire apparaître comme "la plus utilisée" par un seul très long usage —
// on purge/limite plutôt via la fréquence de navigation elle-même (chaque
// vraie navigation crée une ligne, jamais un heartbeat périodique).

async function track(req, res) {
  const vue = (req.body?.vue || '').toString().slice(0, 40);
  if (!vue) return res.status(400).json({ error: 'vue requise' });
  try {
    await pool.query(
      'INSERT INTO usage_log (cp_agent, vue) VALUES (?, ?)',
      [req.agent.cp, vue]
    );
    // Purge des lignes de plus de 180 jours, à chaque insertion (même
    // principe que la purge déjà en place pour l'historique CPS/backups).
    await pool.query('DELETE FROM usage_log WHERE creee_le < DATE_SUB(NOW(), INTERVAL 180 DAY)');
    res.status(204).end();
  } catch (err) {
    // Le suivi d'usage ne doit jamais faire échouer la navigation réelle
    // de l'agent — on log côté serveur, on répond 204 quand même.
    console.error('usage.track:', err.message);
    res.status(204).end();
  }
}

async function getStats(req, res) {
  try {
    const [[{ today }]] = await pool.query(
      `SELECT COUNT(DISTINCT cp_agent) AS today FROM usage_log WHERE creee_le >= CURDATE()`
    );
    const [[{ last7 }]] = await pool.query(
      `SELECT COUNT(DISTINCT cp_agent) AS last7 FROM usage_log WHERE creee_le >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
    const [[{ last30 }]] = await pool.query(
      `SELECT COUNT(DISTINCT cp_agent) AS last30 FROM usage_log WHERE creee_le >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    const [visitesParJour] = await pool.query(
      `SELECT DATE(creee_le) AS jour, COUNT(*) AS total, COUNT(DISTINCT cp_agent) AS agents
       FROM usage_log WHERE creee_le >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(creee_le) ORDER BY jour ASC`
    );
    const [topPages] = await pool.query(
      `SELECT vue, COUNT(*) AS total FROM usage_log
       WHERE creee_le >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY vue ORDER BY total DESC`
    );
    res.json({
      agentsUniques: { today, last7, last30 },
      visitesParJour,
      topPages,
    });
  } catch (err) {
    console.error('usage.getStats:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { track, getStats };
