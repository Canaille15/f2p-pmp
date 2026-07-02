// patch_bulletin_24_validation_dates.js
// Dans parseDeroulePrevisionnel, ajoute un filtre sur les dates invalides (ex: 29/02 sur
// une année non bissextile, 31/04, etc.) pour ne pas envoyer de dates qui planteraient en DB.
// Utilise des repères stables (indexOf) pour localiser le bloc à patcher.
// Exécution : node patch_bulletin_24_validation_dates.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('isNaN(new Date(dateJour).getTime())')) {
  console.log('⚠️  Validation de date déjà présente — aucune modification appliquée.');
  process.exit(0);
}

// Repère stable : la ligne qui construit dateJour dans parseDeroulePrevisionnel
const START = 'const dateJour = `${yyyy}-${mm}-${day}`;';
const END   = 'if (!e.code1) {';

const startIdx = content.indexOf(START);
const endIdx   = content.indexOf(END, startIdx);

if (startIdx === -1) throw new Error("Marqueur 'dateJour' introuvable dans parseDeroulePrevisionnel.");
if (endIdx   === -1) throw new Error("Marqueur 'if (!e.code1)' introuvable après dateJour.");

const before = content.slice(0, startIdx + START.length);
const after  = content.slice(endIdx);

const inserted = `

        // Valider que la date existe réellement (ex: 29/02 sur année non bissextile)
        if (isNaN(new Date(dateJour).getTime())) return;
        const parsedDate = new Date(dateJour);
        if (parsedDate.getMonth() + 1 !== parseInt(mm, 10)) return; // mois débordé (ex: 31/04)

        `;

content = before + inserted + after;
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : validation de date ajoutée dans parseDeroulePrevisionnel (filtre 29/02, 31/04, etc.).');
