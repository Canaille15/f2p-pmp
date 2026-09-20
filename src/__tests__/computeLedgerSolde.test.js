// Tests ciblés (20/09) — computeLedgerSolde, le solde en heures/minutes
// partagé par TC/TY/RN (journal d'ajustements manuels, sans remise à zéro
// annuelle). Couvre en particulier le bug réel du 21/08 (module FIM,
// filtrage par `mois` et non `saisiLe`) et le plafonnement 32h00 de TY.
import { describe, it, expect } from "vitest";
import { computeLedgerSolde, PLAFOND_32H_MIN } from "../App";

const AGENT_ID = "TESTCP";

describe("computeLedgerSolde — sans plafond (RN)", () => {
  it("additionne tous les ajustements, quel que soit l'ordre de saisie", () => {
    const agentProfiles = {
      [AGENT_ID]: {
        rnLedger: [
          { mois: "2026-03", deltaMinutes: 90, saisiLe: "2026-03-05" },
          { mois: "2026-01", deltaMinutes: -30, saisiLe: "2026-03-06" },
          { mois: "2026-02", deltaMinutes: 60, saisiLe: "2026-03-07" },
        ],
      },
    };
    const result = computeLedgerSolde(agentProfiles, AGENT_ID, "rnLedger", null);
    expect(result.solde).toBe(90 - 30 + 60);
    expect(result.horsPlafond).toBe(0);
  });

  it("agent sans aucun ledger → solde 0, pas d'erreur", () => {
    const result = computeLedgerSolde({}, AGENT_ID, "rnLedger", null);
    expect(result.solde).toBe(0);
    expect(result.ledger).toEqual([]);
  });
});

describe("computeLedgerSolde — avec plafond 32h00 (TY)", () => {
  it("un ajout qui dépasse le plafond n'est crédité que jusqu'au plafond, l'excédent va dans horsPlafond", () => {
    const agentProfiles = {
      [AGENT_ID]: {
        tyLedger: [
          // 30h00 (1800 min) puis +5h00 (300 min) → dépasse 32h00 (1920 min)
          { mois: "2026-01", deltaMinutes: 1800, saisiLe: "2026-01-15" },
          { mois: "2026-02", deltaMinutes: 300, saisiLe: "2026-02-15" },
        ],
      },
    };
    const result = computeLedgerSolde(agentProfiles, AGENT_ID, "tyLedger", PLAFOND_32H_MIN);
    expect(result.solde).toBe(PLAFOND_32H_MIN); // plafonné à 32h00
    expect(result.horsPlafond).toBe(1800 + 300 - PLAFOND_32H_MIN); // 180 min "à payer"
  });

  it("un retrait (delta négatif) n'est jamais plafonné, même après un dépassement", () => {
    const agentProfiles = {
      [AGENT_ID]: {
        tyLedger: [
          { mois: "2026-01", deltaMinutes: 2000, saisiLe: "2026-01-15" }, // > plafond
          { mois: "2026-02", deltaMinutes: -500, saisiLe: "2026-02-15" }, // gros retrait
        ],
      },
    };
    const result = computeLedgerSolde(agentProfiles, AGENT_ID, "tyLedger", PLAFOND_32H_MIN);
    // 2000 plafonné à 1920, puis -500 => 1420 (jamais recrédité au-delà du plafond)
    expect(result.solde).toBe(PLAFOND_32H_MIN - 500);
  });

  it("le plafonnement se rejoue dans l'ordre chronologique du mois, pas l'ordre de saisie", () => {
    // Saisi dans le désordre (février avant janvier), mais le calcul doit
    // rejouer janvier PUIS février pour que le plafonnement soit correct.
    const agentProfiles = {
      [AGENT_ID]: {
        tyLedger: [
          { mois: "2026-02", deltaMinutes: 300, saisiLe: "2026-01-01" }, // saisi en premier
          { mois: "2026-01", deltaMinutes: 1800, saisiLe: "2026-01-02" }, // saisi en second
        ],
      },
    };
    const result = computeLedgerSolde(agentProfiles, AGENT_ID, "tyLedger", PLAFOND_32H_MIN);
    expect(result.solde).toBe(PLAFOND_32H_MIN);
    expect(result.horsPlafond).toBe(1800 + 300 - PLAFOND_32H_MIN);
  });
});

describe("computeLedgerSolde — cutoffDate (module FIM, bug corrigé le 21/08)", () => {
  it("filtre sur le MOIS déclaré de l'ajustement, jamais sur la date réelle de saisie", () => {
    // Cas exact signalé par Olivier le 21/08 : un ajustement pour janvier,
    // saisi (cliqué) bien après coup — un rapport figé à fin mars doit tout
    // de même le voir, puisqu'il représente janvier.
    const agentProfiles = {
      [AGENT_ID]: {
        rnLedger: [
          { mois: "2026-01", deltaMinutes: 90, saisiLe: "2026-08-20" }, // saisi tardivement
          { mois: "2026-06", deltaMinutes: 60, saisiLe: "2026-06-05" }, // hors du rapport de mars
        ],
      },
    };
    const result = computeLedgerSolde(agentProfiles, AGENT_ID, "rnLedger", null, "2026-03-31");
    expect(result.solde).toBe(90); // seul janvier est <= fin mars, juin est exclu
  });
});
