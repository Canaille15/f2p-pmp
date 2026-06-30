const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: 'trolley.proxy.rlwy.net',
    port: 47472,
    user: 'root',
    password: 'cVKgGVWWWYHmJslHyHKKJtHzetNdyKBS',
    database: 'railway',
  });

  try {
    console.log('Connexion OK, execution de la requete...');
    const [rows] = await connection.query(
      `SELECT s.id, s.agent_titulaire_cp, s.date_jour, s.equipe_origine,
              s.agents_remplacants, s.motif, s.signale_par, s.signale_le,
              pp.code_equipe AS equipe_actuelle
       FROM previsionnel_signalements s
       LEFT JOIN planning_jour pj ON pj.cp_agent = s.agent_titulaire_cp AND pj.date_jour = s.date_jour
       LEFT JOIN planning_periode pp ON pp.planning_jour_id = pj.id AND pp.ordre = 1
       WHERE (? IS NULL OR s.date_jour >= ?)
         AND (? IS NULL OR s.date_jour <= ?)
       ORDER BY s.date_jour, s.signale_le DESC`,
      [null, null, null, null]);
    console.log('OK - requete executee avec succes, ' + rows.length + ' ligne(s)');
    console.log(rows);
  } catch (err) {
    console.log('ERREUR SQL: ' + err.message);
    console.log('Code: ' + err.code);
    console.log('SQL State: ' + err.sqlState);
  } finally {
    await connection.end();
  }
}

run();
