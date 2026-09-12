// Duplique fidèlement (JS pur, sans dépendance React) le calcul déjà en place
// côté frontend (App.jsx, getDatesFetesAnnee/estJourFerie) — convention déjà
// établie sur ce projet : copié à l'identique plutôt que factoré, pour ne
// courir aucun risque sur un module frontend déjà éprouvé.
// Utilisé pour l'automatisation "poste non tenu → Pause Figée" (12/09) :
// ne jamais déclencher un week-end ni un jour férié, ces cas étant déjà
// couverts par le mécanisme calendaire existant (estNonTenuWeekend côté
// frontend), jamais écrit en base.

function getDatesFetesAnnee(annee) {
  // Pâques (algorithme Butcher-Meeus)
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d2 = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const moisPaq = Math.floor((h + l - 7 * m + 114) / 31);
  const jourPaq = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(annee, moisPaq - 1, jourPaq);

  // Jamais toISOString() ici — decale d'un jour des que le fuseau local est
  // en avance sur UTC (toute la France). Reconstruction depuis les
  // composants LOCAUX de la date uniquement.
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const lunPaques = new Date(paques); lunPaques.setDate(paques.getDate() + 1);       // F2
  const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39);      // F4
  const lunPentecote = new Date(paques); lunPentecote.setDate(paques.getDate() + 50); // F5

  const noel = new Date(annee, 11, 25);
  const noelDow = noel.getDay();
  const vnDate = noelDow === 0 ? `${annee}-12-24` : null;

  const dates = {
    F1: `${annee}-01-01`,
    F2: fmt(lunPaques),
    F3: `${annee}-05-01`,
    F4: fmt(ascension),
    FV: `${annee}-05-08`,
    F5: fmt(lunPentecote),
    F6: `${annee}-07-14`,
    F7: `${annee}-08-15`,
    F8: `${annee}-11-01`,
    F9: `${annee}-11-11`,
    F0: `${annee}-12-25`,
  };
  if (vnDate) dates.VN = vnDate;
  return dates;
}

function estJourFerie(dateStr) {
  const annee = parseInt(dateStr.slice(0, 4), 10);
  const dates = getDatesFetesAnnee(annee);
  return Object.values(dates).includes(dateStr);
}

function estWeekEnd(dateStr) {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 || dow === 6;
}

module.exports = { getDatesFetesAnnee, estJourFerie, estWeekEnd };
