-- Module Formation : catalogue, sessions (jusqu'à 3 formateurs), inscriptions.
-- La colonne is_afo (profil_agent) est ajoutée séparément par le script JS
-- (idempotence vérifiée par SHOW COLUMNS avant, comme les autres migrations
-- one-off du projet). Ce fichier ne contient que les 4 CREATE TABLE.

CREATE TABLE IF NOT EXISTS formation_catalogue (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  categorie     ENUM('PRCI','PAR','Divers') NOT NULL,
  intitule      VARCHAR(150) NOT NULL,
  description   TEXT,
  duree         VARCHAR(50),
  format        VARCHAR(50),
  public_cible  VARCHAR(150),
  prerequis     TEXT,
  obligatoire   TINYINT(1) NOT NULL DEFAULT 0,
  statut        ENUM('actif','archive') NOT NULL DEFAULT 'actif',
  created_by    VARCHAR(10) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_formation_catalogue_categorie (categorie),
  CONSTRAINT fk_formation_catalogue_creation FOREIGN KEY (created_by) REFERENCES agent(cp) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS formation_session (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  catalogue_id       INT UNSIGNED NOT NULL,
  date_session       DATE NOT NULL,
  lieu               VARCHAR(150),
  statut             ENUM('planifiee','lancee','terminee','annulee') NOT NULL DEFAULT 'planifiee',
  message_lancement  TEXT,
  lancee_le          DATETIME DEFAULT NULL,
  cp_agent_creation  VARCHAR(10) DEFAULT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_formation_session_catalogue (catalogue_id),
  KEY idx_formation_session_date (date_session),
  CONSTRAINT fk_formation_session_catalogue FOREIGN KEY (catalogue_id) REFERENCES formation_catalogue(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_formation_session_creation FOREIGN KEY (cp_agent_creation) REFERENCES agent(cp) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS formation_session_formateur (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id  INT UNSIGNED NOT NULL,
  cp_agent    VARCHAR(10) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_formation_session_formateur (session_id, cp_agent),
  CONSTRAINT fk_formation_formateur_session FOREIGN KEY (session_id) REFERENCES formation_session(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_formation_formateur_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pas de colonne de "statut de synchronisation planning" ici : la cohérence
-- entre une inscription et le planning réel de l'agent est calculée à la
-- lecture (jointure vers planning_jour/planning_periode), jamais stockée —
-- voir formationController.js (getSessionDetail).
CREATE TABLE IF NOT EXISTS formation_enrollment (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id   INT UNSIGNED NOT NULL,
  cp_agent     VARCHAR(10) NOT NULL,
  inscrit_le   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inscrit_par  VARCHAR(10) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_formation_enrollment (session_id, cp_agent),
  CONSTRAINT fk_formation_enrollment_session FOREIGN KEY (session_id) REFERENCES formation_session(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_formation_enrollment_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_formation_enrollment_inscripteur FOREIGN KEY (inscrit_par) REFERENCES agent(cp) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
