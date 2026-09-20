// Tests ciblés (20/09) — computeCompteurAvecDetail, le moteur générique
// partagé par les compteurs RP/RU/RQ/RN/TY (DETAIL_CONFIG) : comptage des
// jours par code, mécanisme de report inter-années par date, et solde
// "acquis" (saisie manuelle ou hérité en continu d'une année sur l'autre).
// Aucun de ces mécanismes n'était protégé par un test avant ce jour — une
// régression sur le report ou l'acquis roulant serait passée inaperçue
// jusqu'à ce qu'Olivier remarque un chiffre faux sur son vrai compte.
import { describe, it, expect } from "vitest";
import { computeCompteurAvecDetail } from "../App";

const AGENT = { id: "TESTCP" };

describe("computeCompteurAvecDetail — comptage de base", () => {
  it("compte les jours dont le code équipe correspond, dans l'année demandée", () => {
    const schedule = {
      [`${AGENT.id}-2026-03-10`]: { equipe: "RP" },
      [`${AGENT.id}-2026-06-15`]: { equipe: "RPP" },
      [`${AGENT.id}-2026-09-01`]: { equipe: "RU" }, // autre code, ne compte pas pour RP
    };
    const result = computeCompteurAvecDetail(AGENT, schedule, {}, 2026, ["RP", "RPP"], null, null, false);
    expect(result.total).toBe(2);
    expect(result.tousJours).toEqual(["2026-03-10", "2026-06-15"]);
  });

  it("compte aussi un code présent en 2e créneau (equipe2), pas seulement equipe", () => {
    // Cas réel : RP en créneau principal + RQ en 2e créneau (Nuit remplacée
    // par un repos, mécanisme du 05/09) — RQ doit être compté pour son
    // propre compteur même s'il n'est jamais en `equipe` ce jour-là.
    const schedule = {
      [`${AGENT.id}-2026-03-10`]: { equipe: "RP", equipe2: "RQ" },
    };
    const result = computeCompteurAvecDetail(AGENT, schedule, {}, 2026, ["RQ"], null, null, false);
    expect(result.total).toBe(1);
    expect(result.tousJours).toEqual(["2026-03-10"]);
  });

  it("ignore les jours en dehors de l'année demandée", () => {
    const schedule = {
      [`${AGENT.id}-2025-12-31`]: { equipe: "RP" }, // année précédente
      [`${AGENT.id}-2026-06-01`]: { equipe: "RP" }, // dans l'année
      [`${AGENT.id}-2027-01-01`]: { equipe: "RP" }, // année suivante
    };
    const result = computeCompteurAvecDetail(AGENT, schedule, {}, 2026, ["RP"], null, null, false);
    expect(result.total).toBe(1);
    expect(result.tousJours).toEqual(["2026-06-01"]);
  });
});

describe("computeCompteurAvecDetail — acquis (droit modifiable)", () => {
  it("utilise l'acquis saisi manuellement pour l'année, sans hériter de l'année précédente", () => {
    const schedule = { [`${AGENT.id}-2026-03-10`]: { equipe: "RU" } };
    const agentProfiles = { [AGENT.id]: { ruAcquis: { 2026: 5 } } };
    const result = computeCompteurAvecDetail(AGENT, schedule, agentProfiles, 2026, ["RU"], null, "ruAcquis", false);
    expect(result.acquis).toBe(5);
    expect(result.solde).toBe(5 - 1); // acquis - total pris
  });

  it("solde roulant (rollingAcquis) : sans saisie manuelle, hérite du solde de l'année précédente", () => {
    // 2025 : acquis manuel de 3, 1 seul jour pris → solde 2025 = 2.
    // 2026 : aucune saisie manuelle → doit hériter du solde 2025 (2), moins
    // les jours pris en 2026.
    const schedule = {
      [`${AGENT.id}-2025-05-01`]: { equipe: "RQ" },
      [`${AGENT.id}-2026-07-01`]: { equipe: "RQ" },
    };
    const agentProfiles = { [AGENT.id]: { rqAcquis: { 2025: 3 } } }; // rien pour 2026
    const result2025 = computeCompteurAvecDetail(AGENT, schedule, agentProfiles, 2025, ["RQ"], null, "rqAcquis", true);
    expect(result2025.solde).toBe(2); // 3 acquis - 1 pris

    const result2026 = computeCompteurAvecDetail(AGENT, schedule, agentProfiles, 2026, ["RQ"], null, "rqAcquis", true);
    expect(result2026.acquis).toBe(2); // hérité du solde 2025
    expect(result2026.solde).toBe(1); // 2 hérité - 1 pris en 2026
  });
});

describe("computeCompteurAvecDetail — report inter-années par date", () => {
  it("un jour physiquement dans l'année suivante mais déclaré reporté vers cette année compte dans le total", () => {
    const schedule = {
      [`${AGENT.id}-2026-03-10`]: { equipe: "RP" },
      [`${AGENT.id}-2027-01-02`]: { equipe: "RP" }, // physiquement 2027
    };
    // rpReports[2026] : dates réclamées par l'année 2026 même si prises en 2027.
    const agentProfiles = { [AGENT.id]: { rpReports: { 2026: ["2027-01-02"] } } };
    const result = computeCompteurAvecDetail(AGENT, schedule, agentProfiles, 2026, ["RP", "RPP"], "rpReports", null, false);
    expect(result.total).toBe(2);
    expect(result.reports).toEqual(["2027-01-02"]);
    expect(result.tousJours).toContain("2027-01-02");
  });

  it("un jour physiquement dans cette année mais déjà réclamé par l'année précédente est exclu du total de cette année", () => {
    const schedule = {
      [`${AGENT.id}-2026-01-05`]: { equipe: "RP" }, // physiquement 2026...
      [`${AGENT.id}-2026-08-20`]: { equipe: "RP" }, // ... celui-ci reste bien à 2026
    };
    // ... mais réclamé par 2025 (report vers l'année précédente).
    const agentProfiles = { [AGENT.id]: { rpReports: { 2025: ["2026-01-05"] } } };
    const result = computeCompteurAvecDetail(AGENT, schedule, agentProfiles, 2026, ["RP", "RPP"], "rpReports", null, false);
    expect(result.total).toBe(1);
    expect(result.tousJours).toEqual(["2026-08-20"]);
    expect(result.donnesAnneePrecedente).toEqual(["2026-01-05"]);
  });
});
