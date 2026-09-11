// Bascule automatique d'un "depart programme" (date_depart dans le futur, agent
// toujours actif) vers un depart REELLEMENT effectif (statut='quitte' + planning
// vide au-dela de cette date), une fois la date atteinte -- sans cron : ce module
// est appele a la volee aux points de contact naturels de l'appli (tentative de
// connexion via sweepAgent, ouverture du panneau Admin via sweepAllDue). Demande
// d'Olivier (10-11/09) : pouvoir programmer un depart a l'avance sans couper
// l'acces de l'agent tout de suite -- voir agentController.depart().
const pool = require('../config/db');

// Meme sequence exacte que l'ancien comportement "immediat" de depart() :
// vide le planning strictement apres date_depart, marque l'agent quitte.
async function appliquerDepartEffectif(conn, cp, dateDepart) {
  await conn.query(
    `DELETE FROM planning_periode WHERE planning_jour_id IN
      (SELECT id FROM planning_jour WHERE cp_agent = ? AND date_jour > ?)`,
    [cp, dateDepart]
  );
  await conn.query('DELETE FROM planning_jour WHERE cp_agent = ? AND date_jour > ?', [cp, dateDepart]);
  await conn.query(`UPDATE agent SET statut = 'quitte' WHERE cp = ?`, [cp]);
}

// Verifie UN SEUL agent (scope minimal, appele sur le chemin critique login/register)
// -- si son depart programme est arrive a echeance, l'applique immediatement.
async function sweepAgent(cp) {
  const [rows] = await pool.query(
    `SELECT date_depart FROM agent
     WHERE cp = ? AND statut = 'actif' AND date_depart IS NOT NULL AND date_depart <= CURDATE()`,
    [cp]
  );
  if (!rows.length) return false;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await appliquerDepartEffectif(conn, cp, rows[0].date_depart);
    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Verifie TOUS les agents (appele a l'ouverture du panneau Admin) -- garantit
// que la liste actifs/quittes reste juste meme si aucun agent concerne ne
// s'est reconnecte depuis que sa date est passee.
async function sweepAllDue() {
  const [rows] = await pool.query(
    `SELECT cp, date_depart FROM agent
     WHERE statut = 'actif' AND date_depart IS NOT NULL AND date_depart <= CURDATE()`
  );
  if (!rows.length) return 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const r of rows) await appliquerDepartEffectif(conn, r.cp, r.date_depart);
    await conn.commit();
    return rows.length;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { sweepAgent, sweepAllDue };
