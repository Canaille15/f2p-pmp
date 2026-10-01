const pool = require('../config/db');
const { genererPausesFigeesPourNonTenu } = require('../utils/pauseFigeeAuto');

// GET /api/cps-aleas?from=&to=  -> tous les aleas sur une periode (lecture publique a tous)
async function getAleas(req, res) {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT id, js_code, date_jour, famille, type, agents_concernes, agent_source_id, motif, signale_par, signale_le
       FROM cps_aleas
       WHERE (? IS NULL OR date_jour >= ?)
         AND (? IS NULL OR date_jour <= ?)
       ORDER BY date_jour, js_code`,
      [from||null, from||null, to||null, to||null]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/cps-aleas  -> creer un alea (tous les agents connectes peuvent signaler)
// body: { js_code, date_jour, famille, type, agents_concernes: [cp1, cp2...], motif, agent_source_id }
// agent_source_id (02/10, doublons CPS) : pour un echange/erreur_cps pose sur
// un poste qui affiche plusieurs agents reels le meme jour (titulaire +
// stagiaire en formation-doublon) -- precise LEQUEL des agents actuellement
// affiches ce signalement concerne (agents_concernes, pour ce type, designe
// deja autre chose : les REMPLACANTS proposes). NULL = concerne tout le
// poste, comportement historique inchange (cas normal, un seul agent).
async function createAlea(req, res) {
  const { js_code, date_jour, famille, type, agents_concernes, motif, agent_source_id } = req.body;
  if (!js_code || !date_jour || !famille || !type) {
    return res.status(400).json({ error: 'js_code, date_jour, famille et type sont requis' });
  }
  if (!['echange','erreur_cps','non_tenu','message'].includes(type)) {
    return res.status(400).json({ error: 'Type invalide' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO cps_aleas (js_code, date_jour, famille, type, agents_concernes, agent_source_id, motif, signale_par)
       VALUES (?,?,?,?,?,?,?,?)`,
      [js_code, date_jour, famille, type,
       agents_concernes ? JSON.stringify(agents_concernes) : null,
       agent_source_id || null,
       motif || null, req.agent.cp]);
    // 12/09 -- signalement manuel "poste non tenu" sur un des 4 postes
    // Pauseur : genere automatiquement les pauses figees manquantes pour les
    // agents affectes (jamais bloquant pour la creation de l'alea elle-meme,
    // meme patron que echangesController.cloturer -- une pause figee non
    // generee peut toujours l'etre plus tard via un import ou le backfill).
    if (type === 'non_tenu') {
      try {
        await genererPausesFigeesPourNonTenu(pool, { aleaId: result.insertId, js_code, date_jour, famille });
      } catch (e2) { console.error('genererPausesFigeesPourNonTenu (signalement manuel):', e2); }
    }
    res.status(201).json({ message: 'Aléa signalé', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PATCH /api/cps-aleas/:id  -> modifier un alea existant (18/08, demande par
// Olivier : editer sans devoir effacer et recreer). Motif seul pour un
// message libre ; motif + agents_concernes pour un echange/erreur CPS (etendu
// le meme jour, "dans erreur cps il faut mettre le boutons pour modifier
// aussi") -- le type lui-meme n'est jamais modifiable ici, changer de type
// reviendrait a un tout autre alea, pas une simple correction.
// agent_source_id (02/10) : optionnel, meme principe que agents_concernes --
// absent du body (undefined) = colonne non touchee, pour ne jamais ecraser
// involontairement le ciblage d'un echange/erreur_cps quand seul le motif
// est modifie depuis un appel qui ne connait pas ce champ.
async function updateAlea(req, res) {
  const { id } = req.params;
  const { motif, agents_concernes, agent_source_id } = req.body;
  const sets = ['motif = ?'];
  const params = [motif || null];
  if (agents_concernes !== undefined) { sets.push('agents_concernes = ?'); params.push(JSON.stringify(agents_concernes)); }
  if (agent_source_id !== undefined) { sets.push('agent_source_id = ?'); params.push(agent_source_id || null); }
  params.push(id);
  try {
    const [result] = await pool.query(`UPDATE cps_aleas SET ${sets.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Aléa introuvable' });
    res.json({ message: 'Aléa modifié' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// DELETE /api/cps-aleas/:id  -> retirer un alea (annule le signalement, retour a l'officiel)
// 12/09 : supprime aussi en cascade les pause_figee generees automatiquement
// par cet alea (cps_alea_id) -- qu'il ait ete signale manuellement ou
// auto-active a l'import, meme mecanisme, jamais besoin de connaitre le
// type au prealable (une pause manuelle n'a jamais cps_alea_id renseigne,
// donc jamais touchee ici).
async function deleteAlea(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM pause_figee WHERE cps_alea_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM cps_aleas WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Aléa introuvable' });
    res.json({ message: 'Aléa supprimé' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = { getAleas, createAlea, updateAlea, deleteAlea };
