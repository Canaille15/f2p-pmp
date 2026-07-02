// patch_bulletin_46_fix_nuit_meme_ligne.js
// Correction du second passage prise de nuit dans parseDeroulePrevisionnel :
// "RP PICCLX" orphelin est sur la MÊME ligne que d'autres entrées du même jour
// (ex: "RP PICCLX Lu 2 PICOLO Je 2 PICCL- 2").
// Le jour se détermine depuis les entrées numérotées de la MÊME ligne,
// pas depuis l'entrée précédente dans le texte global (souvent du jour d'avant).

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const OLD_PASS =
`  // ── Second passage : prises de nuit orphelines ──────────────────────────────
  // Cherche les patterns "(RP|RU) CodeNuit" sans day abbr dans le texte.
  // Le CodeNuit précède TOUJOURS un code de service de nuit → crée ou complète l'entrée.
  const NUIT_ORPHAN_RE = /(?:^|\\n)[ \\t]*(RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/gm;
  const DAY_BEFORE_RE = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])/g;
  const dayPositions = [];
  let dm;
  DAY_BEFORE_RE.lastIndex = 0;
  while ((dm = DAY_BEFORE_RE.exec(text)) !== null) {
    const num2 = normaliseNum(dm[2]);
    if (!/^\\d+$/.test(num2)) continue;
    const d2 = parseInt(num2, 10);
    if (d2 < 1 || d2 > 31) continue;
    dayPositions.push({ pos: dm.index, abbr: dm[1], dayNum: d2 });
  }

  let mn2;
  NUIT_ORPHAN_RE.lastIndex = 0;
  while ((mn2 = NUIT_ORPHAN_RE.exec(text)) !== null) {
    const rpCode   = mn2[1]; // "RP" ou "RU"
    const nuitCode = normaliseCode(mn2[2]);
    if (!nuitCode) continue;

    const pos2 = mn2.index;
    let closest = null;
    for (const dp of dayPositions) {
      if (dp.pos < pos2 && (!closest || dp.pos > closest.pos)) closest = dp;
    }
    if (!closest) continue;

    const isBloc2 = sepEnd > 0 && pos2 > sepEnd;
    const cmap   = isBloc2 ? cmap2 : cmap1;
    const key2   = \`\${closest.abbr}_\${closest.dayNum}\`;
    const cands2 = cmap[key2];
    if (!cands2 || cands2.length === 0) continue;

    for (const mm2 of cands2) {
      const dateJour2 = \`\${annee}-\${mm2}-\${String(closest.dayNum).padStart(2,"0")}\`;
      const existing  = jours.find(j => j.date_jour === dateJour2);

      if (existing) {
        // Ajouter la nuit à l'entrée existante si pas déjà présente
        if (!existing.periodes.some(p => p.code_equipe === "N")) {
          const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
          const h2  = getHoraires(eq2);
          existing.periodes.push({
            code_equipe: eq2, code_poste: nuitCode,
            heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
          });
        }
        break;
      } else if (!seen.has(dateJour2)) {
        // Créer une nouvelle entrée RP+nuit
        seen.add(dateJour2);
        const eq1 = deriveCodeEquipeBulletin(rpCode, null);
        const h1  = getHoraires(eq1);
        const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
        const h2  = getHoraires(eq2);
        jours.push({
          date_jour: dateJour2,
          periodes: [
            { code_equipe: eq1, code_poste: null, heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1 },
            { code_equipe: eq2, code_poste: nuitCode, heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2 },
          ],
          source_edition_date: editionDate,
        });
        break;
      }
    }
  }`;

if (!content.includes(OLD_PASS)) {
  throw new Error("Ancien second passage introuvable — vérifie que patch 45b a été appliqué.");
}

const NEW_PASS =
`  // ── Second passage : prises de nuit orphelines ──────────────────────────────
  // "RP PICCLX" orphelin est sur la MÊME ligne que les autres entrées du même jour.
  // Ex: "RP PICCLX Lu 2 PICOLO Je 2 PICCL- 2" → jour 2, chercher dans la même ligne.
  const LINES = text.split(/\\n/);
  const DAY_NUM_RE3 = /(Je|Ve|Sa|Di|Lu|Ma|Me)\\s+(\\d+|[IiSs5])/g;
  const NUIT_LINE_RE = /^[ \\t]*(RP|RU)\\s+(PICC[A-Z0-9-]+|PICO[A-Z0-9-]+)/;

  let lineOffset = 0;
  for (const line of LINES) {
    const nuitMatch = NUIT_LINE_RE.exec(line);
    if (nuitMatch) {
      const rpCode   = nuitMatch[1];
      const nuitCode = normaliseCode(nuitMatch[2]);
      if (nuitCode) {
        // Chercher le numéro de jour le plus fréquent sur cette ligne
        const dayNums = [];
        DAY_NUM_RE3.lastIndex = 0;
        let dm3;
        while ((dm3 = DAY_NUM_RE3.exec(line)) !== null) {
          const n3 = parseInt(normaliseNum(dm3[2]), 10);
          if (n3 >= 1 && n3 <= 31) dayNums.push(n3);
        }
        // Aussi détecter les nombres isolés sur la ligne (ex: "... 2" à la fin)
        const isolatedNums = [...line.matchAll(/(?<![A-Za-z/])\\b(\\d{1,2})\\b(?![/A-Za-z])/g)]
          .map(m => parseInt(m[1], 10)).filter(n => n >= 1 && n <= 31);
        dayNums.push(...isolatedNums);

        if (dayNums.length > 0) {
          // Prendre le numéro le plus fréquent
          const freq3 = {};
          dayNums.forEach(n => { freq3[n] = (freq3[n] || 0) + 1; });
          const dayNum3 = parseInt(Object.entries(freq3).sort((a,b) => b[1]-a[1])[0][0], 10);

          const isBloc2line = sepEnd > 0 && lineOffset > sepEnd;
          const cmap3 = isBloc2line ? cmap2 : cmap1;

          // Chercher toutes les abréviations de jours sur cette ligne pour trouver la bonne
          const lineAbbrs = [];
          DAY_NUM_RE3.lastIndex = 0;
          while ((dm3 = DAY_NUM_RE3.exec(line)) !== null) {
            const n3 = parseInt(normaliseNum(dm3[2]), 10);
            if (n3 === dayNum3) lineAbbrs.push(dm3[1]);
          }

          // Essayer chaque abbr trouvée sur la ligne
          let handled = false;
          for (const abbr3 of lineAbbrs) {
            const key3 = \`\${abbr3}_\${dayNum3}\`;
            const cands3 = cmap3[key3];
            if (!cands3) continue;
            for (const mm3 of cands3) {
              const dateJour3 = \`\${annee}-\${mm3}-\${String(dayNum3).padStart(2,"0")}\`;
              const existing3 = jours.find(j => j.date_jour === dateJour3);
              if (existing3 && !existing3.periodes.some(p => p.code_equipe === "N")) {
                const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
                const h2  = getHoraires(eq2);
                existing3.periodes.push({
                  code_equipe: eq2, code_poste: nuitCode,
                  heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2,
                });
                handled = true; break;
              } else if (!existing3 && !seen.has(dateJour3)) {
                seen.add(dateJour3);
                const eq1 = deriveCodeEquipeBulletin(rpCode, null);
                const h1  = getHoraires(eq1);
                const eq2 = deriveCodeEquipeBulletin(nuitCode, null);
                const h2  = getHoraires(eq2);
                jours.push({
                  date_jour: dateJour3,
                  periodes: [
                    { code_equipe: eq1, code_poste: null, heure_debut: h1.heure_debut, heure_fin: h1.heure_fin, ordre: 1 },
                    { code_equipe: eq2, code_poste: nuitCode, heure_debut: h2.heure_debut, heure_fin: h2.heure_fin, ordre: 2 },
                  ],
                  source_edition_date: editionDate,
                });
                handled = true; break;
              }
              if (handled) break;
            }
            if (handled) break;
          }
        }
      }
    }
    lineOffset += line.length + 1; // +1 pour le \n
  }`;

content = content.replace(OLD_PASS, NEW_PASS);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : second passage nuit basé sur la même ligne.');
