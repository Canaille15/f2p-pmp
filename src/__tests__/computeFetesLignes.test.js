// Tests ciblés (20/09) — computeFetesLignes uniquement, la fonction de
// calcul la plus sensible aux régressions silencieuses du module Fêtes
// légales (plusieurs bugs réels documentés dans CLAUDE.md, tous corrigés
// en conditions réelles à l'époque, mais jamais protégés par un test
// permanent depuis). Chaque test ci-dessous reproduit un cas réel déjà
// vérifié manuellement — s'il casse à nouveau un jour, ce sera détecté
// immédiatement plutôt que redécouvert par Olivier sur son vrai planning.
import { describe, it, expect } from "vitest";
import { computeFetesLignes } from "../App";

const AGENT = { id: "TESTCP" };

function ligne(result, code) {
  return result.lignes.find(l => l.code === code);
}

describe("computeFetesLignes", () => {
  // Bug corrigé le 07/09 (voir CLAUDE.md) : priseLeFinal/estPayee étaient
  // vérifiés APRÈS "dateFete > today" dans la chaîne de statut — une fête
  // future dont le code est déjà présent dans un roulement pré-importé
  // (import "déroulé prévisionnel") se retrouvait classée "futur" au lieu
  // de "prise", alors que le badge vert "· {date}" l'affichait déjà comme
  // réglée juste à côté. Régression que ce test empêche de revenir.
  it("une fête future déjà codée dans le planning est 'prise', jamais 'futur'", () => {
    // asOfDate volontairement OMIS (undefined) : c'est l'usage réel de la
    // vue Fêtes en direct (FetesDashboardModal), PAS le mode "rapport figé"
    // du module FIM (qui, lui, borne exprès la recherche à asOfDate et ne
    // peut donc structurellement jamais voir une fête plus tardive — ce
    // n'est pas le cas que le bug du 07/09 concernait). Sans asOfDate,
    // `today` = la vraie date système ; l'année 2099 garantit que la fête
    // reste "future" quelle que soit la date réelle d'exécution du test.
    const year = 2099;
    const schedule = { [`${AGENT.id}-2099-01-01`]: { equipe: "F1" } };
    const agentProfiles = { [AGENT.id]: { fetesTracking: { [year]: {} } } };

    const result = computeFetesLignes(AGENT, schedule, agentProfiles, year);
    const f1 = ligne(result, "F1");

    expect(f1.dateFete).toBe("2099-01-01");
    expect(f1.dateFete > new Date().toISOString().slice(0, 10)).toBe(true); // toujours future
    expect(f1.statut).toBe("prise");
    expect(f1.priseLe).toBe("2099-01-01");
  });

  // Règle F3 (1er mai) tombant un dimanche, confirmée par Olivier le 10/07 :
  // PERDUE dans tous les cas SAUF si l'agent travaille réellement ce jour-là
  // — seule fête où le RP ne suffit jamais à sauver la fête (contrairement à
  // "toutes les autres fêtes dimanche"). 2033 : le 1er mai tombe un dimanche.
  it("F3 un dimanche sans travail réel → perdue, avec le motif F3 exact", () => {
    const year = 2033;
    const today = "2033-06-01"; // après le 1er mai, fête déjà passée
    const schedule = {}; // rien de saisi ce jour-là
    const agentProfiles = { [AGENT.id]: { fetesTracking: { [year]: {} } } };

    const result = computeFetesLignes(AGENT, schedule, agentProfiles, year, today);
    const f3 = ligne(result, "F3");

    expect(f3.dateFete).toBe("2033-05-01");
    expect(f3.estF3Dimanche).toBe(true);
    expect(f3.statut).toBe("perdue");
    expect(f3.motifReglementaire).toMatch(/seuls les agents qui travaillent réellement/);
  });

  it("F3 un dimanche AVEC travail réel ce jour-là → RC accordé, jamais perdue", () => {
    const year = 2033;
    const today = "2033-06-01";
    // Agent en poste (Matinée) le 1er mai 2033 lui-même.
    const schedule = { [`${AGENT.id}-2033-05-01`]: { equipe: "M" } };
    const agentProfiles = { [AGENT.id]: { fetesTracking: { [year]: {} } } };

    const result = computeFetesLignes(AGENT, schedule, agentProfiles, year, today);
    const f3 = ligne(result, "F3");

    expect(f3.estTravaillePlanning).toBe(true);
    expect(f3.estRCAccorde).toBe(true);
    expect(f3.estPerdue).toBe(false);
    expect(f3.statut).not.toBe("perdue");
  });

  // Contraste : une fête dimanche "normale" (pas F3) est TOUJOURS perdue,
  // même si l'agent travaillait ce jour-là — précisé par Olivier le 05/08,
  // seul le 1er mai fait exception. Sert de garde-fou pour ne jamais
  // généraliser par erreur la règle F3 à une autre fête.
  it("une autre fête (pas F3) tombant un dimanche est toujours perdue, même travaillée", () => {
    // F7 (15 août) — cherche une année où elle tombe un dimanche.
    // 15 août 2027 est un dimanche.
    const year = 2027;
    const today = "2027-09-01";
    const schedule = { [`${AGENT.id}-2027-08-15`]: { equipe: "M" } };
    const agentProfiles = { [AGENT.id]: { fetesTracking: { [year]: {} } } };

    const result = computeFetesLignes(AGENT, schedule, agentProfiles, year, today);
    const f7 = ligne(result, "F7");

    expect(f7.dateFete).toBe("2027-08-15");
    expect(f7.estDimanche).toBe(true);
    expect(f7.estF3Dimanche).toBe(false);
    expect(f7.statut).toBe("perdue");
  });
});
