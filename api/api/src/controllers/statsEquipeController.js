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
    const [[hc]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(COALESCE(pa.is_reserve,0)) AS nbReserve
       FROM agent a LEFT JOIN profil_agent pa ON pa.cp_agent = a.cp`
    );
    const totalAgents = hc.total || 0;
    const totalReserve = Number(hc.nbReserve) || 0;
    const totalEquipe = totalAgents - totalReserve;

    // ─── Âge moyen hors Réserve régionale (#8) ───────────────────────────────
    const [ageRows] = await pool.query(
      `SELECT a.cp, COALESCE(pa.is_reserve,0) AS is_reserve
       FROM agent a LEFT JOIN profil_agent pa ON pa.cp_agent = a.cp`
    );
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

    // (a) présence directe d'un réserviste dans planning_cps
    const [presenceDirecte] = await pool.query(
      `SELECT pc.famille, pc.cp_agent, pc.date_jour
       FROM planning_cps pc JOIN profil_agent pa ON pa.cp_agent = pc.cp_agent
       WHERE pa.is_reserve = 1 AND pc.date_jour BETWEEN ? AND ?`,
      [from, to]
    );
    presenceDirecte.forEach(r => {
      numeratorSet.add(`${r.famille}|${r.cp_agent}|${r.date_jour instanceof Date ? r.date_jour.toISOString().slice(0,10) : r.date_jour}`);
    });

    // (b) réserviste couvrant un poste vacant via une aléa échange/erreur_cps
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
    const coverageReserve = {
      global: { pct: pct(numGlobal, denomGlobal), numerateur: numGlobal, denominateur: denomGlobal },
      PRCI: { pct: pct(countFamille(numeratorSet,'PRCI'), denominateur.PRCI), numerateur: countFamille(numeratorSet,'PRCI'), denominateur: denominateur.PRCI },
      PAR: { pct: pct(countFamille(numeratorSet,'PAR'), denominateur.PAR), numerateur: countFamille(numeratorSet,'PAR'), denominateur: denominateur.PAR },
    };

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
    const [habRows] = await pool.query(
      `SELECT code_poste, COUNT(DISTINCT cp_agent) AS nbAgents
       FROM habilitation WHERE date_fin IS NULL
       GROUP BY code_poste ORDER BY nbAgents DESC`
    );
    const habilitationsParPoste = habRows.map(r => ({ code_poste: r.code_poste, nbAgents: r.nbAgents }));

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
      headcounts: { totalAgents, totalEquipe, totalReserve, nbTempsPartiel, pctTempsPartiel },
      ageMoyenHorsReserve,
      coverageReserve,
      congesRefuses,
      vtRefuses,
      postesNonTenus,
      formationInterne,
      habilitationsParPoste,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { getStats };
