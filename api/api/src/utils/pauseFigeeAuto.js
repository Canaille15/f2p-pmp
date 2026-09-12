// Automatisation "poste non tenu (Pauseur) -> Pause Figee manquante" (12/09,
// demande par Olivier). Logique metier partagee par 3 points d'entree :
//   - aleasController.createAlea (signalement manuel, bouton 🔄 dans CPS Officiel)
//   - cpsController.importCps (auto-activation si un poste Pauseur reste une
//     case vide sur la feuille de presence importee)
//   - add_backfill_pause_figee_pauseur.js (script one-off, backfill depuis
//     le debut de l'annee)
//
// Regle explicite d'Olivier : jamais le week-end ni un jour ferie (deja
// couverts par le mecanisme calendaire estNonTenuWeekend cote frontend, qui
// n'ecrit jamais rien en base) -- les pauses figees ne concernent que les
// jours de semaine.
const { estJourFerie, estWeekEnd } = require('./joursFeries');

// Mapping jsCode Pauseur -> postes 3x8 dont l'absence du Pauseur prive les
// agents de leur pause (derive de POSTES_PRCI_3x8/POSTES_PAR_3x8, App.jsx).
const POSTES_AFFECTES_PAR_PAUSEUR = {
  PIPA1J: ['PILNE-', 'PILNO-', 'PICCL-', 'PICCLO', 'PILNOO'], // Pauseur CCL
  PIPA2J: ['PILCL-', 'PIADJ-', 'PIADJO', 'PILNEO'],           // Pauseur Adjoint
  PIPA3J: ['PIVGD-', 'PIVGDO'],                                // Pauseur VGD
  PAPAUJ: ['PAAC1-', 'PAAC1O'],                                // Pauseur PAR
};

const PAUSEUR_FAMILLE = { PIPA1J: 'PRCI', PIPA2J: 'PRCI', PIPA3J: 'PRCI', PAPAUJ: 'PAR' };

// Genere les pauses figees manquantes pour les agents affectes par un alea
// non_tenu deja cree (aleaId) sur un poste Pauseur. Jamais bloquant, jamais
// d'ecrasement d'une pause deja presente (manuelle ou auto-taguee).
async function genererPausesFigeesPourNonTenu(conn, { aleaId, js_code, date_jour, famille }) {
  const postesAffectes = POSTES_AFFECTES_PAR_PAUSEUR[js_code];
  if (!postesAffectes) return; // pas un poste Pauseur, rien a faire
  if (estWeekEnd(date_jour) || estJourFerie(date_jour)) return; // deja couvert par le mecanisme calendaire
  for (const poste of postesAffectes) {
    const [rows] = await conn.query(
      'SELECT cp_agent FROM planning_cps WHERE date_jour=? AND js_code=?',
      [date_jour, poste]
    );
    for (const { cp_agent } of rows) {
      // No-op strict si la ligne existe deja (pause manuelle OU deja taguee
      // par un autre passage) -- jamais ecrasee.
      await conn.query(
        `INSERT INTO pause_figee (cp_agent, date_jour, cps_alea_id) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE cp_agent = cp_agent`,
        [cp_agent, date_jour, aleaId]
      );
    }
  }
}

// Detecte si un poste Pauseur est reste une case vide sur une date deja
// importee (au moins une ligne planning_cps de la meme famille ce jour-la,
// preuve que la feuille a bien ete importee -- sinon on ne peut rien
// affirmer, jamais de faux positif) et, le cas echeant, active
// automatiquement le signalement "poste non tenu" comme si le bouton 🔄
// avait ete clique -- puis genere les pauses figees manquantes. Si un alea
// existe deja pour ce poste/date (signale manuellement avant, y compris sur
// une date jamais encore importee), ne recree jamais de doublon -- se
// contente de (re)generer les pauses figees pour cet alea existant.
async function detecterEtAutoSignalerNonTenu(conn, { js_code, date_jour, signalePar }) {
  const famille = PAUSEUR_FAMILLE[js_code];
  if (!famille) return; // pas un des 4 postes Pauseur
  if (estWeekEnd(date_jour) || estJourFerie(date_jour)) return;

  const [familleRows] = await conn.query(
    'SELECT 1 FROM planning_cps WHERE date_jour=? AND famille=? LIMIT 1',
    [date_jour, famille]
  );
  if (!familleRows.length) return; // feuille de cette famille jamais importee ce jour-la -- rien a affirmer

  const [posteRows] = await conn.query(
    'SELECT 1 FROM planning_cps WHERE date_jour=? AND js_code=? LIMIT 1',
    [date_jour, js_code]
  );
  if (posteRows.length) return; // poste tenu

  const [existant] = await conn.query(
    `SELECT id FROM cps_aleas WHERE js_code=? AND date_jour=? AND famille=? AND type='non_tenu' LIMIT 1`,
    [js_code, date_jour, famille]
  );
  if (existant.length) {
    // Deja signale (manuellement, potentiellement avant que la feuille ne
    // soit importee) -- jamais de doublon, on rattrape juste les pauses
    // figees qui n'avaient pas pu etre generees a l'epoque.
    await genererPausesFigeesPourNonTenu(conn, { aleaId: existant[0].id, js_code, date_jour, famille });
    return;
  }

  const [result] = await conn.query(
    `INSERT INTO cps_aleas (js_code, date_jour, famille, type, agents_concernes, motif, signale_par)
     VALUES (?,?,?,'non_tenu','[]',?,?)`,
    [js_code, date_jour, famille, 'Poste non tenu (détecté automatiquement à l\'import — case vide sur la feuille)', signalePar]
  );
  await genererPausesFigeesPourNonTenu(conn, { aleaId: result.insertId, js_code, date_jour, famille });
}

module.exports = {
  POSTES_AFFECTES_PAR_PAUSEUR,
  PAUSEUR_FAMILLE,
  genererPausesFigeesPourNonTenu,
  detecterEtAutoSignalerNonTenu,
};
