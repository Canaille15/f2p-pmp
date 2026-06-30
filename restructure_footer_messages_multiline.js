const fs = require('fs');
const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('<br/>Seules les journ')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// Message CPS Officiel
const oldCps = 'La feuille de pr\u00e9sence officielle ne peut pas \u00eatre modifi\u00e9e ici. Seuls les signalements \u{1F504} (\u00e9change de poste, erreur CPS) viennent s\u2019ajouter par-dessus, \u00e0 titre indicatif.';
const idxCps = content.indexOf(oldCps);
if (idxCps === -1) { console.log('ERREUR: message CPS introuvable'); process.exit(1); }
const newCps = 'La feuille de pr\u00e9sence officielle ne peut pas \u00eatre modifi\u00e9e ici.<br/>Seuls les signalements \u{1F504} (\u00e9change de poste, erreur CPS) viennent s\u2019ajouter par-dessus, \u00e0 titre indicatif.';
content = content.slice(0, idxCps) + newCps + content.slice(idxCps + oldCps.length);
console.log('OK - message CPS restructure en 2 lignes');

// Message Previsionnel
const oldPrev = 'Ici, chaque agent partage volontairement son planning personnel (\u00e0 activer dans Mon Profil) pour aider \u00e0 s\u2019organiser collectivement. Seules les journ\u00e9es de travail sont partag\u00e9es \u2014 le reste (cong\u00e9s, absences...) ne l\u2019est pas. Ces informations restent indicatives et ne remplacent jamais la feuille de pr\u00e9sence officielle \u2014 en cas d\u2019\u00e9cart, rapproche-toi de l\u2019encadrement.';
const idxPrev = content.indexOf(oldPrev);
if (idxPrev === -1) { console.log('ERREUR: message Previsionnel introuvable'); process.exit(1); }
const newPrev = 'Ici, chaque agent partage volontairement son planning personnel (\u00e0 activer dans Mon Profil) pour aider \u00e0 s\u2019organiser collectivement.<br/>Seules les journ\u00e9es de travail sont partag\u00e9es \u2014 le reste (cong\u00e9s, absences...) ne l\u2019est pas.<br/>Ces informations restent indicatives et ne remplacent jamais la feuille de pr\u00e9sence officielle \u2014 en cas d\u2019\u00e9cart, rapproche-toi de l\u2019encadrement.';
content = content.slice(0, idxPrev) + newPrev + content.slice(idxPrev + oldPrev.length);
console.log('OK - message Previsionnel restructure en 3 lignes');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
