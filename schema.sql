-- ============================================================
-- F2P.PMP — Schéma MariaDB
-- Encodage UTF8MB4, moteur InnoDB, FK activées
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. AGENT ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent (
  cp            VARCHAR(10)   NOT NULL,
  nom           VARCHAR(50)   NOT NULL,
  prenom        VARCHAR(50)   NOT NULL,
  grade         VARCHAR(20)   NOT NULL,
  initiales     VARCHAR(5)    NOT NULL,
  email         VARCHAR(255)  DEFAULT NULL COMMENT 'chiffré AES-256',
  telephone     VARCHAR(100)  DEFAULT NULL COMMENT 'chiffré AES-256',
  date_entree   DATE          DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. AUTH ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent      VARCHAR(10)   NOT NULL,
  pin_hash      VARCHAR(255)  NOT NULL COMMENT 'bcrypt coût 12, PIN 5 chiffres',
  is_admin      TINYINT(1)    NOT NULL DEFAULT 0,
  last_login    DATETIME      DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_agent (cp_agent),
  CONSTRAINT fk_auth_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. SESSION ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent      VARCHAR(10)   NOT NULL,
  token_hash    VARCHAR(255)  NOT NULL COMMENT 'SHA-256 du JWT',
  device        VARCHAR(50)   DEFAULT NULL COMMENT 'mobile|desktop|tablet',
  expires_at    DATETIME      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_agent (cp_agent),
  KEY idx_session_token (token_hash),
  KEY idx_session_expires (expires_at),
  CONSTRAINT fk_session_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. PROFIL_AGENT ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profil_agent (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent      VARCHAR(10)   NOT NULL,
  is_reserve    TINYINT(1)    NOT NULL DEFAULT 0,
  familles_hab  ENUM('PRCI','PAR','BOTH') DEFAULT NULL,
  couleurs      JSON          DEFAULT NULL,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_profil_agent (cp_agent),
  CONSTRAINT fk_profil_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. AGENT_FAMILLE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_famille (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  famille         ENUM('PRCI','PAR') NOT NULL,
  type_affectation ENUM('3x8','Journée','Les deux') NOT NULL,
  date_debut      DATE          NOT NULL,
  date_fin        DATE          DEFAULT NULL COMMENT 'NULL = affectation en cours',
  PRIMARY KEY (id),
  KEY idx_af_agent (cp_agent),
  KEY idx_af_dates (date_debut, date_fin),
  CONSTRAINT fk_af_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. ROULEMENT_HISTORIQUE ─────────────────────────────────
CREATE TABLE IF NOT EXISTS roulement_historique (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  type_roulement  ENUM('3x8','Journée','Réserve') NOT NULL,
  date_debut      DATE          NOT NULL,
  date_fin        DATE          DEFAULT NULL COMMENT 'NULL = roulement actif',
  note            VARCHAR(255)  DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_roul_agent (cp_agent),
  KEY idx_roul_dates (date_debut, date_fin),
  CONSTRAINT fk_roul_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. POSTE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poste (
  code            VARCHAR(20)   NOT NULL,
  label           VARCHAR(50)   NOT NULL,
  subtitle        VARCHAR(100)  DEFAULT NULL,
  famille         ENUM('PRCI','PAR') NOT NULL,
  type_horaire    ENUM('3x8','Journée') NOT NULL,
  horaires        VARCHAR(50)   DEFAULT NULL COMMENT 'ex: 06h10–14h17',
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 8. HABILITATION ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habilitation (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  code_poste      VARCHAR(20)   NOT NULL,
  date_debut      DATE          NOT NULL,
  date_fin        DATE          DEFAULT NULL COMMENT 'NULL = habilitation valide',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hab_agent (cp_agent),
  KEY idx_hab_poste (code_poste),
  CONSTRAINT fk_hab_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hab_poste FOREIGN KEY (code_poste) REFERENCES poste(code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 9. PLANNING_JOUR ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_jour (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  date_jour       DATE          NOT NULL,
  source          ENUM('manuel','previsionnel','import') NOT NULL DEFAULT 'manuel',
  modifie_le      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_planning_jour (cp_agent, date_jour),
  KEY idx_pj_date (date_jour),
  CONSTRAINT fk_pj_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 10. PLANNING_PERIODE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS planning_periode (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  planning_jour_id INT UNSIGNED NOT NULL,
  ordre           TINYINT       NOT NULL DEFAULT 1 COMMENT '1=principal, 2=secondaire',
  code_equipe     VARCHAR(10)   NOT NULL COMMENT 'M|AM|N|J|RP|CA|FOR|DISPO...',
  code_poste      VARCHAR(20)   DEFAULT NULL,
  heure_debut     TIME          DEFAULT NULL,
  heure_fin       TIME          DEFAULT NULL,
  prive           TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '0=visible vue équipe',
  note            VARCHAR(255)  DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_periode (planning_jour_id, ordre),
  KEY idx_pp_poste (code_poste),
  CONSTRAINT fk_pp_jour FOREIGN KEY (planning_jour_id) REFERENCES planning_jour(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_poste FOREIGN KEY (code_poste) REFERENCES poste(code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 11. IMPORT_PREVISIONNEL ─────────────────────────────────
CREATE TABLE IF NOT EXISTS import_previsionnel (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  date_import     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  periode_debut   DATE          NOT NULL,
  periode_fin     DATE          NOT NULL,
  source_type     ENUM('PDF','photo','manuel') NOT NULL,
  nb_jours        INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_imp_agent (cp_agent),
  CONSTRAINT fk_imp_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 12. CONGE_DEMANDE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS conge_demande (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  annee           YEAR          NOT NULL,
  date_debut      DATE          NOT NULL,
  date_fin        DATE          NOT NULL,
  nb_jours        INT           NOT NULL,
  type            ENUM('CA','RP','RU','RQ','autre') NOT NULL DEFAULT 'CA',
  statut          ENUM('demandé','accordé','refusé','annulé') NOT NULL DEFAULT 'demandé',
  note_agent      TEXT          DEFAULT NULL,
  reponse_ecrite  TEXT          DEFAULT NULL,
  date_reponse    DATE          DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cd_agent (cp_agent),
  KEY idx_cd_annee (annee),
  CONSTRAINT fk_cd_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 13. FETE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fete (
  code            VARCHAR(5)    NOT NULL,
  label           VARCHAR(50)   NOT NULL,
  type_calcul     ENUM('fixe','mobile','conditionnel') NOT NULL,
  mois_fixe       TINYINT       DEFAULT NULL,
  jour_fixe       TINYINT       DEFAULT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 14. FETE_SUIVI ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fete_suivi (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  code_fete       VARCHAR(5)    NOT NULL,
  annee           YEAR          NOT NULL,
  date_fete_reelle DATE         NOT NULL,
  date_limite     DATE          NOT NULL,
  date_prise      DATE          DEFAULT NULL,
  type_prise      ENUM('planning','RC','manuel') DEFAULT NULL,
  statut          ENUM('à_venir','en_attente','prise','payée','perdue') NOT NULL DEFAULT 'à_venir',
  mois_paye       TINYINT       DEFAULT NULL,
  annee_paye      YEAR          DEFAULT NULL,
  note            VARCHAR(255)  DEFAULT NULL,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fete_suivi (cp_agent, code_fete, annee),
  KEY idx_fs_agent (cp_agent),
  CONSTRAINT fk_fs_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fs_fete  FOREIGN KEY (code_fete) REFERENCES fete(code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 15. RELIQUAT_CONGE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS reliquat_conge (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  annee_origine   YEAR          NOT NULL,
  code_fete       VARCHAR(5)    DEFAULT NULL,
  date_limite     DATE          NOT NULL,
  statut          ENUM('à_prendre','pris','payé','perdu') NOT NULL DEFAULT 'à_prendre',
  date_prise      DATE          DEFAULT NULL,
  note            VARCHAR(255)  DEFAULT NULL,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rc_agent (cp_agent),
  CONSTRAINT fk_rc_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rc_fete  FOREIGN KEY (code_fete) REFERENCES fete(code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 16. PAUSE_FIGEE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pause_figee (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  date_jour       DATE          NOT NULL,
  mois_fia        DATE          DEFAULT NULL COMMENT 'premier jour du mois de prise FIA',
  fia_done        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pause (cp_agent, date_jour),
  KEY idx_pf_agent (cp_agent),
  CONSTRAINT fk_pf_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 17. ECHANGE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS echange (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_initiateur   VARCHAR(10)   NOT NULL,
  date_echange    DATE          NOT NULL,
  message         TEXT          DEFAULT NULL,
  statut          ENUM('ouvert','en_cours','validé','annulé','refusé') NOT NULL DEFAULT 'ouvert',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at    DATETIME      DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_ech_initiateur (cp_initiateur),
  KEY idx_ech_date (date_echange),
  CONSTRAINT fk_ech_init FOREIGN KEY (cp_initiateur) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 18. ECHANGE_PARTICIPANT ─────────────────────────────────
CREATE TABLE IF NOT EXISTS echange_participant (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  echange_id      INT UNSIGNED  NOT NULL,
  cp_agent        VARCHAR(10)   NOT NULL,
  role            ENUM('initiateur','candidat','acceptant') NOT NULL,
  poste_avant     VARCHAR(20)   DEFAULT NULL,
  poste_apres     VARCHAR(20)   DEFAULT NULL,
  statut_accord   ENUM('en_attente','accepté','refusé') NOT NULL DEFAULT 'en_attente',
  repondu_le      DATETIME      DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ep (echange_id, cp_agent),
  KEY idx_ep_agent (cp_agent),
  CONSTRAINT fk_ep_echange    FOREIGN KEY (echange_id) REFERENCES echange(id) ON DELETE CASCADE,
  CONSTRAINT fk_ep_agent      FOREIGN KEY (cp_agent)   REFERENCES agent(cp) ON UPDATE CASCADE,
  CONSTRAINT fk_ep_poste_av   FOREIGN KEY (poste_avant) REFERENCES poste(code) ON UPDATE CASCADE,
  CONSTRAINT fk_ep_poste_ap   FOREIGN KEY (poste_apres) REFERENCES poste(code) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 19. ECHANGE_BADGE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS echange_badge (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  planning_jour_id    INT UNSIGNED NOT NULL,
  echange_id          INT UNSIGNED NOT NULL,
  cp_agent_original   VARCHAR(10)  NOT NULL,
  poste_original      VARCHAR(20)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_eb_jour    (planning_jour_id),
  KEY idx_eb_echange (echange_id),
  CONSTRAINT fk_eb_jour    FOREIGN KEY (planning_jour_id) REFERENCES planning_jour(id) ON DELETE CASCADE,
  CONSTRAINT fk_eb_echange FOREIGN KEY (echange_id)       REFERENCES echange(id)       ON DELETE CASCADE,
  CONSTRAINT fk_eb_agent   FOREIGN KEY (cp_agent_original) REFERENCES agent(cp)        ON UPDATE CASCADE,
  CONSTRAINT fk_eb_poste   FOREIGN KEY (poste_original)    REFERENCES poste(code)      ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 20. DISPONIBILITE_ECHANGE ───────────────────────────────
CREATE TABLE IF NOT EXISTS disponibilite_echange (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  type            ENUM('permanent','ponctuel') NOT NULL DEFAULT 'ponctuel',
  date_debut      DATE          DEFAULT NULL,
  date_fin        DATE          DEFAULT NULL,
  disponible      TINYINT(1)    NOT NULL DEFAULT 1,
  motif           VARCHAR(100)  DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_de_agent (cp_agent),
  KEY idx_de_dates (date_debut, date_fin),
  CONSTRAINT fk_de_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 21. NOTIFICATION ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  type            ENUM('protocole','reliquat','fete','pause_fia','echange') NOT NULL,
  titre           VARCHAR(100)  NOT NULL,
  message         TEXT          NOT NULL,
  acquittee       TINYINT(1)    NOT NULL DEFAULT 0,
  snooze_jusqu_au DATE          DEFAULT NULL,
  ref_id          INT UNSIGNED  DEFAULT NULL,
  ref_type        VARCHAR(30)   DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acquittee_le    DATETIME      DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_notif_agent    (cp_agent),
  KEY idx_notif_type     (type),
  KEY idx_notif_acquitte (acquittee),
  CONSTRAINT fk_notif_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── INDEX COMPOSITES PERFORMANCE ────────────────────────────
-- Planning : accès par agent + plage de dates (usage très fréquent)
ALTER TABLE planning_jour
  ADD INDEX idx_pj_agent_date (cp_agent, date_jour);

-- Sessions expirées : nettoyage CRON
ALTER TABLE session
  ADD INDEX idx_sess_cleanup (expires_at, cp_agent);

-- Fête suivi : recherche par agent + année
ALTER TABLE fete_suivi
  ADD INDEX idx_fs_agent_annee (cp_agent, annee);

-- Notifications non lues par agent
ALTER TABLE notification
  ADD INDEX idx_notif_agent_non_lue (cp_agent, acquittee, created_at);

SET FOREIGN_KEY_CHECKS = 1;
