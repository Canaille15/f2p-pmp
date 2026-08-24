const pool = require('../config/db');

async function lookupPoste(cp, date_jour) {
  let [[jour]] = await pool.query(
    `SELECT pp.code_poste, pp.code_equipe, pp.heure_debut, pp.heure_fin
     FROM planning_jour pj
     JOIN planning_periode pp ON pp.planning_jour_id = pj.id
     WHERE pj.cp_agent = ? AND pj.date_jour = ? AND pp.code_poste IS NOT NULL
     ORDER BY pp.ordre ASC LIMIT 1`,
    [cp, date_jour]
  );

  if (!jour) {
    [[jour]] = await pool.query(
      `SELECT pp.code_poste, pp.code_equipe, pp.heure_debut, pp.heure_fin
       FROM planning_jour pj
       JOIN planning_periode pp ON pp.planning_jour_id = pj.id
       WHERE pj.cp_agent = ? AND pj.date_jour = DATE_SUB(?, INTERVAL 1 DAY)
         AND pp.note = 'debut_nuit' AND pp.code_poste IS NOT NULL
       ORDER BY pp.ordre ASC LIMIT 1`,
      [cp, date_jour]
    );
  }
  return jour || null;
}

// Famille (PRCI/PAR) du demandeur au moment de la creation -- capturee une
// fois pour toutes, comme code_poste/code_equipe/heures, pour reconstituer
// plus tard (a la cloture, parfois des semaines apres) le code CPS exact
// sans dependre de l'etat "actuel" de l'agent.
async function lookupFamille(cp) {
  const [[row]] = await pool.query(
    `SELECT familles_hab FROM profil_agent WHERE cp_agent = ?`, [cp]
  );
  return (row && row.familles_hab) || 'PRCI';
}

// GET /api/echanges/poste-du-jour/:cp/:date -- expose lookupPoste() pour
// n'importe quel agent (24/08, echange bilateral) : a la cloture, il faut
// aussi savoir quel poste l'agent qui ACCEPTE l'echange cedait lui-meme ce
// jour-la, pour creer le 2e alea symetrique (voir cloturer). Rien de plus
// sensible que ce que CPS Officiel affiche deja publiquement a tous.
async function posteDuJour(req, res) {
  const { cp, date } = req.params;
  try {
    const jour = await lookupPoste(cp, date);
    res.json(jour || null);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// GET /api/echanges
async function getEchanges(req, res) {
  const cp = req.agent.cp;
  try {
    // Purge automatique : on retire les demandes dont la date est passée de plus d'1 mois
    await pool.query("DELETE FROM echange WHERE date_jour < DATE_SUB(CURDATE(), INTERVAL 1 MONTH)");

    const [rows] = await pool.query(
      `SELECT e.*, a.nom, a.prenom, p.label AS poste_label,
              ae.nom AS echange_avec_nom, ae.prenom AS echange_avec_prenom,
              (SELECT COUNT(*) FROM echange_interet ei WHERE ei.echange_id = e.id) AS nb_interets,
              (SELECT GROUP_CONCAT(CONCAT(ai.prenom,' ',ai.nom) SEPARATOR ', ')
                 FROM echange_interet ei2 JOIN agent ai ON ai.cp = ei2.cp_agent
                 WHERE ei2.echange_id = e.id) AS interesses_noms,
              EXISTS(SELECT 1 FROM echange_interet ei3 WHERE ei3.echange_id = e.id AND ei3.cp_agent = ?) AS mon_interet
       FROM echange e
       JOIN agent a ON a.cp = e.cp_demandeur
       LEFT JOIN poste p ON p.code = e.code_poste
       LEFT JOIN agent ae ON ae.cp = e.cp_echange_avec
       ORDER BY e.date_jour ASC, e.created_at ASC`,
      [cp]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// GET /api/echanges/:id/interesses
async function getInteresses(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT ei.cp_agent, a.nom, a.prenom, ei.created_at
       FROM echange_interet ei
       JOIN agent a ON a.cp = ei.cp_agent
       WHERE ei.echange_id = ?
       ORDER BY ei.created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges
async function createEchange(req, res) {
  const cp = req.agent.cp;
  const { date_jour, creneaux_souhaites, urgent, motif } = req.body;
  if (!date_jour) return res.status(400).json({ error: 'date_jour requis' });

  try {
    const jour = await lookupPoste(cp, date_jour);
    if (!jour) return res.status(404).json({ error: 'Aucun poste précis trouvé dans ton planning pour cette date (jour de repos ou poste non renseigné).' });
    const famille = await lookupFamille(cp);

    const creneauxStr = Array.isArray(creneaux_souhaites) ? creneaux_souhaites.join(',') : (creneaux_souhaites || null);

    const [result] = await pool.query(
      `INSERT INTO echange
        (cp_demandeur, date_jour, code_poste, code_equipe, famille, heure_debut, heure_fin, creneaux_souhaites, urgent, motif)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [cp, date_jour, jour.code_poste, jour.code_equipe, famille, jour.heure_debut, jour.heure_fin, creneauxStr, urgent ? 1 : 0, motif || null]
    );
    res.status(201).json({ message: 'Demande créée', id: result.insertId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// PUT /api/echanges/:id — si la date change, on recalcule le poste ET on annule silencieusement
// les intérêts déjà manifestés (l'agent les verra disparaître la prochaine fois qu'il consulte la demande).
async function updateEchange(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  const { date_jour, creneaux_souhaites, urgent, motif } = req.body;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur !== cp) return res.status(403).json({ error: 'Seul le demandeur peut modifier cette demande' });
    if (echange.statut !== 'ouverte') return res.status(409).json({ error: 'Demande déjà clôturée ou expirée' });

    const creneauxStr = Array.isArray(creneaux_souhaites) ? creneaux_souhaites.join(',') : (creneaux_souhaites ?? echange.creneaux_souhaites);

    let nouvelleDate = echange.date_jour;
    let codePoste = echange.code_poste, codeEquipe = echange.code_equipe, heureDebut = echange.heure_debut, heureFin = echange.heure_fin;
    let dateChangee = false;

    if (date_jour && date_jour !== echange.date_jour) {
      const jour = await lookupPoste(cp, date_jour);
      if (!jour) return res.status(404).json({ error: 'Aucun poste précis trouvé dans ton planning pour cette nouvelle date.' });
      nouvelleDate = date_jour;
      codePoste = jour.code_poste; codeEquipe = jour.code_equipe; heureDebut = jour.heure_debut; heureFin = jour.heure_fin;
      dateChangee = true;
    }

    await pool.query(
      `UPDATE echange SET date_jour=?, code_poste=?, code_equipe=?, heure_debut=?, heure_fin=?, creneaux_souhaites=?, urgent=?, motif=? WHERE id=?`,
      [nouvelleDate, codePoste, codeEquipe, heureDebut, heureFin, creneauxStr,
       urgent !== undefined ? (urgent ? 1 : 0) : echange.urgent,
       motif !== undefined ? motif : echange.motif, id]
    );

    if (dateChangee) {
      await pool.query('DELETE FROM echange_interet WHERE echange_id=?', [id]);
    }

    res.json({ message: 'Demande mise à jour' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges/:id/interet
async function toggleInteret(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur === cp) return res.status(400).json({ error: 'Tu ne peux pas te déclarer intéressé par ta propre demande' });

    const [[existant]] = await pool.query(
      'SELECT id FROM echange_interet WHERE echange_id=? AND cp_agent=?', [id, cp]
    );
    if (existant) {
      await pool.query('DELETE FROM echange_interet WHERE id=?', [existant.id]);
      return res.json({ message: 'Intérêt retiré', interesse: false });
    }
    await pool.query(
      'INSERT INTO echange_interet (echange_id, cp_agent) VALUES (?,?)', [id, cp]
    );
    res.json({ message: 'Intérêt enregistré', interesse: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// POST /api/echanges/:id/cloturer
// body: { cp_echange_avec, js_code? } -- js_code (24/08, demande d'Olivier :
// "que les echanges de journee se note automatiquement dans le planning
// cps") est calcule cote FRONTEND (convertirCodePosteVersJsCode, deja utilise
// partout ailleurs pour cette traduction code_poste+code_equipe -> code CPS
// canonique -- jamais duplique cote backend, pour ne jamais risquer une
// derive entre les deux). S'il est fourni ET que la famille est connue
// (capturee a la creation de la demande -- absente sur une demande ouverte
// AVANT ce correctif, cree sans code_equipe/famille), un alea CPS "echange"
// est cree automatiquement -- meme table, meme mecanisme, meme bouton
// d'annulation (✕, ouvert a tout agent connecte) qu'un echange signale a la
// main depuis CPS Officiel. Si js_code est absent (demande trop ancienne,
// ou traduction impossible cote frontend) la cloture reste toujours
// possible normalement, seul l'alea automatique est saute -- ne jamais
// bloquer la cloture pour cette raison.
async function cloturer(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  const { cp_echange_avec, js_code, famille, js_code_reciproque, famille_reciproque } = req.body;
  if (!cp_echange_avec) return res.status(400).json({ error: 'cp_echange_avec requis' });
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur !== cp) return res.status(403).json({ error: 'Seul le demandeur peut clôturer cette demande' });
    if (echange.statut !== 'ouverte') return res.status(409).json({ error: 'Demande déjà clôturée ou expirée' });

    await pool.query(
      `UPDATE echange SET statut='cloturee', cp_echange_avec=?, cloturee_le=NOW() WHERE id=?`,
      [cp_echange_avec, id]
    );

    // famille : celle du POSTE (deduite cote frontend via POSTE_REGISTRY,
    // 24/08) est prioritaire sur celle du DEMANDEUR capturee a la creation
    // -- cas reel trouve en testant : un poste fixe PRCI/PAR a une famille
    // intrinseque et non ambigue (ex: PICCLO ne peut etre que PRCI), alors
    // que profil_agent.familles_hab reflete la famille "principale" de
    // l'agent, qui peut diverger dans de vrais cas (postes generiques
    // multi-familles VM/DISPO/CAF/AY/JEQ, renfort occasionnel...). Sans ce
    // repli, l'alea se serait cree avec la mauvaise famille et ne se serait
    // jamais affiche sur le bon poste dans CPS Officiel.
    const familleAlea = famille || echange.famille;
    let aleaCree = false;
    if (js_code && familleAlea) {
      try {
        const motif = echange.motif
          ? `Échange (module Échanges) — ${echange.motif}`
          : 'Échange conclu via le module Échanges';
        await pool.query(
          `INSERT INTO cps_aleas (js_code, date_jour, famille, type, agents_concernes, motif, signale_par, echange_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [js_code, echange.date_jour, familleAlea, 'echange',
           JSON.stringify([cp_echange_avec]), motif, cp, id]
        );
        aleaCree = true;
      } catch (e) {
        // Ne jamais faire echouer la cloture elle-meme pour ca -- l'agent
        // recoit juste l'info que l'ecriture CPS automatique n'a pas pu se
        // faire, il peut toujours l'indiquer lui-meme (comme avant).
        console.error('Alea CPS automatique (cloture echange) :', e);
      }
    }

    // 2e alea, symetrique (24/08) : un VRAI echange est un TROC -- si
    // cp_echange_avec avait lui-meme un poste ce jour-la (ex: il faisait la
    // Soiree pendant que le demandeur faisait la Matinee), ce poste-la doit
    // aussi passer au demandeur, sinon il reste "couvert par cp_echange_avec"
    // dans CPS alors qu'il n'y est plus -- poste non couvert en pratique.
    // Calcule cote frontend (meme resolveJsCode+POSTE_REGISTRY que le 1er
    // cote), transmis ici optionnellement. Absent si cp_echange_avec n'avait
    // aucun poste ce jour-la (l'ancien comportement, un seul cote, suffit).
    let alea2Cree = false;
    if (js_code_reciproque && famille_reciproque && js_code_reciproque !== js_code) {
      try {
        const motif2 = echange.motif
          ? `Échange (module Échanges) — ${echange.motif}`
          : 'Échange conclu via le module Échanges';
        await pool.query(
          `INSERT INTO cps_aleas (js_code, date_jour, famille, type, agents_concernes, motif, signale_par, echange_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [js_code_reciproque, echange.date_jour, famille_reciproque, 'echange',
           JSON.stringify([cp]), motif2, cp, id]
        );
        alea2Cree = true;
      } catch (e) {
        console.error('Alea CPS automatique (cloture echange, cote reciproque) :', e);
      }
    }

    res.json({ message: 'Demande clôturée', alea_cps_cree: aleaCree, alea_cps_cree_reciproque: alea2Cree });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

// DELETE /api/echanges/:id
async function deleteEchange(req, res) {
  const { id } = req.params;
  const cp = req.agent.cp;
  try {
    const [[echange]] = await pool.query('SELECT * FROM echange WHERE id = ?', [id]);
    if (!echange) return res.status(404).json({ error: 'Demande introuvable' });
    if (echange.cp_demandeur !== cp) return res.status(403).json({ error: 'Seul le demandeur peut supprimer cette demande' });

    // Suppression en cascade des aleas CPS crees automatiquement a la
    // cloture (24/08, demande d'Olivier : "lorsqu'une demande d'echange est
    // annulé il faut aussi annulé automatiquement le message qui avait ete
    // creer dans cps") -- une demande cloturee peut avoir cree 1 ou 2 aleas
    // (voir cloturer(), champ echange_id qui les relie). Si la demande
    // n'avait jamais ete cloturee (ou que l'ecriture CPS avait echoue),
    // aucun alea n'a ce echange_id -- suppression sans effet, jamais bloquant.
    const [aleasSupprimes] = await pool.query('DELETE FROM cps_aleas WHERE echange_id=?', [id]);
    await pool.query('DELETE FROM echange WHERE id=?', [id]);
    res.json({ message: 'Demande supprimée', aleas_cps_supprimes: aleasSupprimes.affectedRows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
}

module.exports = {
  getEchanges, getInteresses, createEchange, updateEchange,
  toggleInteret, cloturer, deleteEchange, posteDuJour
};
