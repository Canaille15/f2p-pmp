const pool = require('../config/db');

// Heuristique de désambiguïsation de siècle sur les 2 premiers chiffres du CP
// (ex: "68" dans "6810186B" -> 1968). Un agent SNCF actif n'a normalement pas
// moins de 16 ans -> toute année à moins de 16 ans dans le passé est traitée
// comme le siècle courant, sinon le précédent.
function parseAnneeNaissance(cp) {
  const m = /^(\d{2})/.exec(cp || '');
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const currentYY = new Date().getFullYear() % 100;
  const century = (yy > currentYY - 16) ? 1900 : 2000;
  return century + yy;
}

// Fragment identique à celui de formationController.js (getStats) — une session
// pas encore lancée compte toujours ; une fois lancée, seuls les agents qui
// n'ont pas retiré le code FOR de leur planning perso comptent encore.
const PRESENCE_REELLE = `(
  fs.statut != 'lancee' OR EXISTS(
    SELECT 1 FROM planning_jour pj JOIN planning_periode pp ON pp.planning_jour_id=pj.id
    WHERE pj.cp_agent = fe.cp_agent AND pj.date_jour = fs.date_session AND pp.code_equipe='FOR'
  )
)`;

// Couverture Réserve régionale (#4) — extrait en fonction reutilisable le
// 18/08 pour pouvoir la calculer sur plusieurs annees a la fois (demande
// d'Olivier : "fait les stat par annee"), sans dupliquer la logique entre
// l'annee courante et l'historique.
async function computeCoverageReserve(from, to) {
  const [denomRows] = await pool.query(
    `SELECT famille, COUNT(*) AS total FROM planning_cps
     WHERE date_jour BETWEEN ? AND ? GROUP BY famille`,
    [from, to]
  );
  const denominateur = { PRCI: 0, PAR: 0 };
  denomRows.forEach(r => { denominateur[r.famille] = r.total; });

  const [reserveCps] = await pool.query(`SELECT cp_agent FROM profil_agent WHERE is_reserve = 1`);
  const reserveSet = new Set(reserveCps.map(r => r.cp_agent));

  const numeratorSet = new Set(); // clé "famille|cp|date"

  const [presenceDirecte] = await pool.query(
    `SELECT pc.famille, pc.cp_agent, pc.date_jour
     FROM planning_cps pc JOIN profil_agent pa ON pa.cp_agent = pc.cp_agent
     WHERE pa.is_reserve = 1 AND pc.date_jour BETWEEN ? AND ?`,
    [from, to]
  );
  presenceDirecte.forEach(r => {
    numeratorSet.add(`${r.famille}|${r.cp_agent}|${r.date_jour instanceof Date ? r.date_jour.toISOString().slice(0,10) : r.date_jour}`);
  });

  const [aleas] = await pool.query(
    `SELECT js_code, date_jour, famille, agents_concernes FROM cps_aleas
     WHERE type IN ('echange','erreur_cps') AND date_jour BETWEEN ? AND ?`,
    [from, to]
  );
  const [remplis] = await pool.query(
    `SELECT DISTINCT date_jour, js_code FROM planning_cps
     WHERE date_jour BETWEEN ? AND ? AND js_code IS NOT NULL`,
    [from, to]
  );
  const remplisSet = new Set(remplis.map(r => `${r.date_jour instanceof Date ? r.date_jour.toISOString().slice(0,10) : r.date_jour}|${r.js_code}`));
  aleas.forEach(a => {
    const dateStr = a.date_jour instanceof Date ? a.date_jour.toISOString().slice(0,10) : a.date_jour;
    const keyRempli = `${dateStr}|${a.js_code}`;
    if (remplisSet.has(keyRempli)) return; // le poste n'était pas vacant, pas une couverture réserve
    let concernes = [];
    try { concernes = typeof a.agents_concernes === 'string' ? JSON.parse(a.agents_concernes) : (a.agents_concernes || []); } catch (e) { concernes = []; }
    concernes.forEach(cp => {
      if (reserveSet.has(cp)) numeratorSet.add(`${a.famille}|${cp}|${dateStr}`);
    });
  });

  function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; }
  function countFamille(set, famille) {
    let n = 0;
    set.forEach(k => { if (k.startsWith(`${famille}|`)) n++; });
    return n;
  }
  const numGlobal = numeratorSet.size;
  const denomGlobal = (denominateur.PRCI || 0) + (denominateur.PAR || 0);
  return {
    global: { pct: pct(numGlobal, denomGlobal), numerateur: numGlobal, denominateur: denomGlobal },
    PRCI: { pct: pct(countFamille(numeratorSet,'PRCI'), denominateur.PRCI), numerateur: countFamille(numeratorSet,'PRCI'), denominateur: denominateur.PRCI },
    PAR: { pct: pct(countFamille(numeratorSet,'PAR'), denominateur.PAR), numerateur: countFamille(numeratorSet,'PAR'), denominateur: denominateur.PAR },
  };
}

// GET /api/stats-equipe?year=2026
async function getStats(req, res) {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  try {
    // ─── Effectifs (#1-3) ─────────────────────────────────────────────────
    // "EAC" (élève/agent en formation initiale) abandonné le 16/08 avant même
    // d'être utilisé : Olivier a confondu le nouveau bouton avec "Réserve
    // régionale" (déjà en place depuis juillet, déjà correctement peuplé) —
    // plutôt que de faire ressaisir 70 fiches, tout le module réutilise
    // is_reserve. Le flag is_eac (colonne + AdminPanel) a été retiré.
    // ageRows sert aussi de base unique pour tous les effectifs (fusionné le
    // 18/08 avec l'ancienne requête `hc` séparée) — évite deux comptages qui
    // pourraient diverger.
    const [ageRows] = await pool.query(
      `SELECT a.cp, a.grade, COALESCE(pa.is_reserve,0) AS is_reserve, COALESCE(pa.is_afo,0) AS is_afo
       FROM agent a LEFT JOIN profil_agent pa ON pa.cp_agent = a.cp`
    );
    const totalAgents = ageRows.length;
    const reserveSet = new Set(ageRows.filter(r => r.is_reserve).map(r => r.cp));
    const totalReserve = reserveSet.size;

    // ─── Encadrement (DPX/Adj DPX) mis à part (18/08, demande d'Olivier :
    // "il faut mettre a par les dpx et assisant [...] et tu recalcule bien
    // les effectifs des autres") — basé sur la table `habilitation` (même
    // source que "Agents habilités par poste"), pas un flag dédié sur
    // l'agent. Un agent habilité DPX/Adj DPX est retiré du décompte "Agents
    // équipe" (recalculé net, via une différence d'ensembles pour rester
    // correct même dans le cas rare d'un chevauchement avec Réserve
    // régionale) — jamais retiré du total "Agents global", qui reste un vrai
    // total de tous les agents.
    const CODES_ENCADREMENT = ['PIDPXJ', 'PIASSJ', 'PADPXJ'];
    const [encadrementRows] = await pool.query(
      `SELECT DISTINCT cp_agent FROM habilitation WHERE code_poste IN (?,?,?) AND date_fin IS NULL`,
      CODES_ENCADREMENT
    );
    const encadrementSet = new Set(encadrementRows.map(r => r.cp_agent));
    const totalEncadrement = encadrementSet.size;
    const totalAfo = ageRows.filter(r => r.is_afo).length;

    // ─── Grades (18/08, demande d'Olivier : "decompté les Cadre Op [...]
    // les Maitrises [...] et Maytises 2", puis en suite immédiate : "affine
    // chaque groupe pour mettre un decompte en nombre des agent et reserve
    // regionale [...] tu garde le global par groupe") — basé sur
    // `agent.grade`, préfixe (les vrais grades ont des suffixes
    // NIV1/NIV2/NIV3, ex. "CP5NIV2"). Purement informatif, comme AFO :
    // jamais soustrait d'"Agents équipe" (contrairement à Encadrement, qui
    // est basé sur le poste tenu, pas le grade — un agent peut très bien
    // être Cadre Op ET DPX à la fois). Chaque groupe garde son total global
    // (totalCadreOp/totalMaitrise/totalMaitrise2, inchangés) + un détail
    // équipe/réserve régionale (reserveSet déjà calculé plus haut).
    let totalCadreOp = 0, totalMaitrise = 0, totalMaitrise2 = 0;
    let cadreOpReserve = 0, maitriseReserve = 0, maitrise2Reserve = 0;
    ageRows.forEach(r => {
      const g = r.grade || '';
      const estReserve = reserveSet.has(r.cp);
      if (g.startsWith('CP6') || g.startsWith('CO6')) { totalCadreOp++; if (estReserve) cadreOpReserve++; }
      if (g.startsWith('CP5') || g.startsWith('CO5')) { totalMaitrise++; if (estReserve) maitriseReserve++; }
      if (g.startsWith('CP4') || g.startsWith('CO4')) { totalMaitrise2++; if (estReserve) maitrise2Reserve++; }
    });
    const gradesDetail = {
      cadreOp: { total: totalCadreOp, equipe: totalCadreOp - cadreOpReserve, reserve: cadreOpReserve },
      maitrise: { total: totalMaitrise, equipe: totalMaitrise - maitriseReserve, reserve: maitriseReserve },
      maitrise2: { total: totalMaitrise2, equipe: totalMaitrise2 - maitrise2Reserve, reserve: maitrise2Reserve },
    };
    // "Agents équipe" = tout le monde sauf Réserve régionale ET Encadrement,
    // par différence d'ensembles (jamais une simple soustraction de totaux,
    // qui compterait deux fois un éventuel agent à la fois réserve et DPX).
    const equipeSet = new Set(ageRows.map(r => r.cp));
    reserveSet.forEach(cp => equipeSet.delete(cp));
    encadrementSet.forEach(cp => equipeSet.delete(cp));
    const totalEquipe = equipeSet.size;

    let sommeAges = 0, nbAgentsInclus = 0, nbAgentsExclusParseEchec = 0;
    ageRows.forEach(r => {
      if (r.is_reserve) return;
      const naissance = parseAnneeNaissance(r.cp);
      if (naissance == null) { nbAgentsExclusParseEchec++; return; }
      sommeAges += (year - naissance);
      nbAgentsInclus++;
    });
    const ageMoyenHorsReserve = {
      moyenne: nbAgentsInclus ? Math.round((sommeAges / nbAgentsInclus) * 10) / 10 : null,
      nbAgentsInclus,
      nbAgentsExclusParseEchec,
    };

    // ─── Couverture Réserve régionale (#4) ───────────────────────────────────
    const coverageReserve = await computeCoverageReserve(from, to);

    // ─── Couverture Réserve régionale par année (18/08, demande d'Olivier :
    // "fait les stat par annee") — même fenêtre de 5 ans que le sélecteur
    // d'année du frontend (currentYear+1 à currentYear-3), pour permettre de
    // voir l'évolution du taux de couverture d'une année sur l'autre sans
    // avoir à rouvrir la page pour chaque année une par une.
    const anneeCouranteReelle = new Date().getFullYear();
    const anneesCoverage = [anneeCouranteReelle + 1, anneeCouranteReelle, anneeCouranteReelle - 1, anneeCouranteReelle - 2, anneeCouranteReelle - 3];
    const coverageReserveParAnnee = [];
    for (const y of anneesCoverage) {
      const cov = y === year ? coverageReserve : await computeCoverageReserve(`${y}-01-01`, `${y}-12-31`);
      coverageReserveParAnnee.push({ annee: y, ...cov });
    }

    // ─── Postes non tenus (#7) ──────────────────────────────────────────────
    const [nonTenusRows] = await pool.query(
      `SELECT js_code, date_jour, motif FROM cps_aleas
       WHERE type = 'non_tenu' AND date_jour BETWEEN ? AND ?
       ORDER BY js_code, date_jour`,
      [from, to]
    );
    const parPosteMap = {};
    nonTenusRows.forEach(r => {
      if (!parPosteMap[r.js_code]) parPosteMap[r.js_code] = { js_code: r.js_code, nb: 0, entries: [] };
      parPosteMap[r.js_code].nb++;
      parPosteMap[r.js_code].entries.push({
        date_jour: r.date_jour instanceof Date ? r.date_jour.toISOString().slice(0,10) : r.date_jour,
        motif: r.motif || null,
      });
    });
    const postesNonTenus = {
      total: nonTenusRows.length,
      parPoste: Object.values(parPosteMap).sort((a,b) => b.nb - a.nb),
    };

    // ─── Formation interne (#9-10) ──────────────────────────────────────────
    const [[joursFormation]] = await pool.query(
      `SELECT COUNT(DISTINCT fs.date_session) AS n FROM formation_session fs
       WHERE YEAR(fs.date_session) = ? AND fs.statut IN ('lancee','terminee')`,
      [year]
    );
    const [[agentsFormes]] = await pool.query(
      `SELECT COUNT(DISTINCT fe.cp_agent) AS n
       FROM formation_enrollment fe JOIN formation_session fs ON fs.id = fe.session_id
       WHERE YEAR(fs.date_session) = ? AND fs.statut IN ('lancee','terminee') AND ${PRESENCE_REELLE}`,
      [year]
    );
    const formationInterne = { nbJours: joursFormation.n || 0, nbAgentsFormes: agentsFormes.n || 0 };

    // ─── Habilitations par poste (#11) ──────────────────────────────────────
    // PPRCI retiré le 16/08 (Olivier : "tout le monde est apte à ça", pas
    // significatif) — rien ne le remplace ici, DISPO est une stat à part non
    // nominative (voir plus bas), ce tableau reste nominatif par construction.
    const [habRows] = await pool.query(
      `SELECT code_poste, COUNT(DISTINCT cp_agent) AS nbAgents
       FROM habilitation WHERE date_fin IS NULL AND code_poste != 'PPRCI'
       GROUP BY code_poste ORDER BY nbAgents DESC`
    );
    const habilitationsParPoste = habRows.map(r => ({ code_poste: r.code_poste, nbAgents: r.nbAgents }));

    // ─── Dispo (#g, 16/08 ; étendu 23/08) — toujours anonyme côté réponse,
    // jamais de nom d'agent ni de CP exposé, même pour les 2 nouvelles
    // sources ci-dessous (Stat'Equip reste "aucune donnée nominative n'y
    // transite", principe établi depuis sa création). 3 sources désormais :
    // (a) le mécanisme d'origine, message libre CPS (cps_aleas type='message',
    //     motif contenant "dispo") — agents_concernes toujours vide pour ce
    //     type (App.jsx:1343), structurellement impossible à dédupliquer par
    //     agent, reste dans son propre bucket "anonyme" ;
    // (b) DISPO réel importé en CPS Officiel (planning_cps.equipe='DISPO',
    //     ex. CAILLET Maxime 24/08 — voir résolus du 23/08) ;
    // (c) DISPO sélectionné dans le planning perso (23/08, nouveau poste
    //     "Journée", planning_periode.code_poste='DISPO').
    // (b) et (c) sont TOUS DEUX agent-identifiés (cp_agent+date) — dédupliqués
    // entre eux via un Set avant comptage ("attention pas de doublon", un
    // agent qui a lui-même saisi DISPO dans son perso ET dont le même jour
    // est aussi réellement importé en CPS ne doit compter qu'une fois) puis
    // agrégés en un total "identifié" (regroupé par date uniquement dans la
    // réponse, jamais par agent) — distinct du bucket "anonyme" (a), qui ne
    // peut structurellement pas être recoupé avec les 2 autres (aucun
    // cp_agent dans cps_aleas pour ce type).
    const [dispoAnonymeRows] = await pool.query(
      `SELECT date_jour, motif FROM cps_aleas
       WHERE type = 'message' AND LOWER(motif) LIKE '%dispo%' AND date_jour BETWEEN ? AND ?
       ORDER BY date_jour`,
      [from, to]
    );
    const [dispoPersoRows] = await pool.query(
      `SELECT pj.cp_agent AS cp_agent, pj.date_jour AS date_jour
       FROM planning_jour pj JOIN planning_periode pp ON pp.planning_jour_id = pj.id
       WHERE pp.code_equipe = 'J' AND pp.code_poste = 'DISPO' AND pj.date_jour BETWEEN ? AND ?`,
      [from, to]
    );
    const [dispoCpsRows] = await pool.query(
      `SELECT cp_agent, date_jour FROM planning_cps
       WHERE equipe = 'DISPO' AND date_jour BETWEEN ? AND ?`,
      [from, to]
    );
    const fmtD = (d) => d instanceof Date ? d.toISOString().slice(0,10) : d;
    const dispoIdentifieSet = new Set(); // clé "cp|date", dédupliquée entre perso et CPS Officiel
    [...dispoPersoRows, ...dispoCpsRows].forEach(r => {
      dispoIdentifieSet.add(`${r.cp_agent}|${fmtD(r.date_jour)}`);
    });
    const dispoIdentifieParDate = {};
    dispoIdentifieSet.forEach(k => {
      const d = k.split('|')[1];
      dispoIdentifieParDate[d] = (dispoIdentifieParDate[d] || 0) + 1;
    });
    const dispo = {
      total: dispoIdentifieSet.size + dispoAnonymeRows.length,
      identifie: {
        total: dispoIdentifieSet.size,
        parDate: Object.entries(dispoIdentifieParDate)
          .sort((a,b) => a[0] < b[0] ? -1 : 1)
          .map(([date_jour, nb]) => ({ date_jour, nb })),
      },
      anonyme: {
        total: dispoAnonymeRows.length,
        entries: dispoAnonymeRows.map(r => ({
          date_jour: fmtD(r.date_jour),
          motif: r.motif || null,
        })),
      },
    };

    // ─── Réserve / Roulement — historique mensuel (#b,c,d, 16/08, ajusté le 17/08) ─
    // Distinct de "Réserve régionale" (is_reserve) — et surtout, un axe qui ne
    // s'applique QU'aux agents "équipe" (hors Réserve régionale, qui a déjà son
    // propre compte à part) : Olivier — "les agents reserve regionale en compte
    // a part". Le dénominateur est donc totalEquipe, jamais totalAgents,
    // et les lignes roulement_historique d'un agent Réserve régionale sont
    // ignorées ici. Depuis le 18/08, l'Encadrement (DPX/Adj DPX) est lui aussi
    // exclu de cet axe pour rester cohérent avec le nouveau totalEquipe (net
    // de Réserve régionale ET d'Encadrement) — sinon la somme "dont X réserve
    // · Y roulement" ne correspondrait plus au total affiché sur la tuile
    // "Agents équipe". Réutilise roulement_historique (déjà daté, existait mais
    // jamais branché à un bouton) pour garantir qu'un changement de statut en
    // décembre ne modifie jamais les mois déjà passés. Seules 2 valeurs
    // comptent : 'Réserve' vs tout le reste ("Roulement" à l'affichage, que la
    // ligne source soit '3x8' ou 'Journée').
    const agentsEquipeCps = equipeSet;
    const [roulementRows] = await pool.query(
      `SELECT cp_agent, type_roulement, date_debut, date_fin FROM roulement_historique ORDER BY cp_agent, date_debut`
    );
    const dstr = v => v instanceof Date ? v.toISOString().slice(0,10) : v;
    const roulementParAgent = {};
    roulementRows.forEach(r => {
      if (!agentsEquipeCps.has(r.cp_agent)) return; // Réserve régionale : compte à part, exclu de cet axe
      if (!roulementParAgent[r.cp_agent]) roulementParAgent[r.cp_agent] = [];
      roulementParAgent[r.cp_agent].push({ type_roulement: r.type_roulement, date_debut: dstr(r.date_debut), date_fin: dstr(r.date_fin) });
    });
    function nbReserveAuMois(finMoisStr) {
      let n = 0;
      Object.values(roulementParAgent).forEach(rows => {
        const actif = rows.filter(r => r.date_debut <= finMoisStr && (!r.date_fin || r.date_fin > finMoisStr)).pop();
        if (actif && actif.type_roulement === 'Réserve') n++;
      });
      return n;
    }
    const parMois = [];
    for (let m = 1; m <= 12; m++) {
      const finMois = new Date(year, m, 0);
      const finMoisStr = `${finMois.getFullYear()}-${String(finMois.getMonth()+1).padStart(2,'0')}-${String(finMois.getDate()).padStart(2,'0')}`;
      const nbReserve = nbReserveAuMois(finMoisStr);
      parMois.push({ mois: m, nbReserve, nbRoulement: totalEquipe - nbReserve });
    }
    const nbReserveActuel = nbReserveAuMois(dstr(new Date()));
    const reserveRoulement = { actuel: { nbReserve: nbReserveActuel, nbRoulement: totalEquipe - nbReserveActuel }, parMois };

    // ─── Scans donnees_json (#5, #6, #12) — congés/VT refusés (anonymisés),
    // temps partiel — un seul fetch, une seule boucle Node ─────────────────
    const [profils] = await pool.query(
      `SELECT donnees_json FROM profil_agent WHERE donnees_json IS NOT NULL`
    );
    let congesJours = 0, congesAgents = 0;
    let vtJours = 0, vtAgents = 0;
    let nbTempsPartiel = 0;

    profils.forEach(row => {
      let extra = {};
      try { extra = typeof row.donnees_json === 'string' ? JSON.parse(row.donnees_json) : (row.donnees_json || {}); } catch (e) { extra = {}; }

      let congesCount = 0;
      Object.entries(extra.congesDemandes || {}).forEach(([date, d]) => {
        if (d?.statut === 'refuse' && date.slice(0,4) === String(year)) congesCount++;
      });
      if (congesCount > 0) { congesJours += congesCount; congesAgents++; }

      let vtCount = 0;
      Object.entries(extra.vtTracking || {}).forEach(([date, d]) => {
        if (d?.statut === 'refuse' && date.slice(0,4) === String(year)) vtCount++;
      });
      if (vtCount > 0) { vtJours += vtCount; vtAgents++; }

      if ((extra.vtEntitlement?.[year] || 0) > 0) nbTempsPartiel++;
    });

    const congesRefuses = { nbJours: congesJours, nbAgentsConcernes: congesAgents };
    const vtRefuses = { nbJours: vtJours, nbAgentsConcernes: vtAgents };
    const pctTempsPartiel = totalAgents > 0 ? Math.round((nbTempsPartiel / totalAgents) * 1000) / 10 : 0;

    res.json({
      headcounts: { totalAgents, totalEquipe, totalReserve, totalEncadrement, totalAfo, totalCadreOp, totalMaitrise, totalMaitrise2, nbTempsPartiel, pctTempsPartiel },
      gradesDetail,
      ageMoyenHorsReserve,
      coverageReserve,
      coverageReserveParAnnee,
      congesRefuses,
      vtRefuses,
      postesNonTenus,
      formationInterne,
      habilitationsParPoste,
      dispo,
      reserveRoulement,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getStats };
