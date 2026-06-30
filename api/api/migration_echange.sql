-- ============================================================
-- Migration module Échanges — F2P.PMP
-- Supprime l'ancien système (jamais utilisé, 0 ligne en base)
-- Crée la nouvelle structure validée avec Olivier
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Suppression de l'ancien système (vide, non utilisé) ──────
DROP TABLE IF EXISTS echange_badge;
DROP TABLE IF EXISTS echange_participant;
DROP TABLE IF EXISTS disponibilite_echange;
DROP TABLE IF EXISTS echange;

-- ── Nouvelle table ECHANGE ────────────────────────────────────
-- Une ligne = une demande d'échange pour une seule journée
CREATE TABLE IF NOT EXISTS echange (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_demandeur    VARCHAR(10)   NOT NULL,
  date_jour       DATE          NOT NULL,
  code_poste      VARCHAR(20)   DEFAULT NULL COMMENT 'poste occupé ce jour-là',
  heure_debut     TIME          DEFAULT NULL,
  heure_fin       TIME          DEFAULT NULL,
  creneaux_souhaites VARCHAR(100) DEFAULT NULL COMMENT 'CSV: matin,journee,soiree,nuit,indifferent',
  secteurs_souhaites VARCHAR(50)  DEFAULT NULL COMMENT 'CSV: PRCI,PAR,indifferent',
  urgent          TINYINT(1)    NOT NULL DEFAULT 0,
  motif           VARCHAR(255)  DEFAULT NULL,
  statut          ENUM('ouverte','cloturee','expiree') NOT NULL DEFAULT 'ouverte',
  cp_echange_avec VARCHAR(10)   DEFAULT NULL COMMENT 'rempli à la clôture par le demandeur',
  cloturee_le     DATETIME      DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ech_demandeur (cp_demandeur),
  KEY idx_ech_date (date_jour),
  KEY idx_ech_statut (statut),
  CONSTRAINT fk_ech_demandeur FOREIGN KEY (cp_demandeur) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ech_poste FOREIGN KEY (code_poste) REFERENCES poste(code) ON UPDATE CASCADE,
  CONSTRAINT fk_ech_echange_avec FOREIGN KEY (cp_echange_avec) REFERENCES agent(cp) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Table ECHANGE_INTERET ─────────────────────────────────────
-- Liste des agents ayant cliqué "Je suis intéressé" sur une demande
CREATE TABLE IF NOT EXISTS echange_interet (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  echange_id      INT UNSIGNED  NOT NULL,
  cp_agent        VARCHAR(10)   NOT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interet (echange_id, cp_agent),
  KEY idx_int_agent (cp_agent),
  CONSTRAINT fk_int_echange FOREIGN KEY (echange_id) REFERENCES echange(id) ON DELETE CASCADE,
  CONSTRAINT fk_int_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Index composite : liste triée par date, hors expirées ────
ALTER TABLE echange
  ADD INDEX idx_ech_statut_date (statut, date_jour);

SET FOREIGN_KEY_CHECKS = 1;
