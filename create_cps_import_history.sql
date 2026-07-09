-- Historique des imports CPS Officiel : un lot (batch) par import, avec le detail
-- avant/apres de chaque ligne touchee (necessaire pour pouvoir annuler un import).
-- Purge automatique au-dela de 90 jours, faite cote applicatif a chaque import.

CREATE TABLE IF NOT EXISTS cps_import_batch (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  importe_par   VARCHAR(10)  NOT NULL,
  importe_le    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nb_entrees    INT UNSIGNED NOT NULL,
  annule_le     DATETIME     DEFAULT NULL,
  annule_par    VARCHAR(10)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_cps_batch_importe_le (importe_le),
  CONSTRAINT fk_cps_batch_agent FOREIGN KEY (importe_par) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cps_import_detail (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id        INT UNSIGNED NOT NULL,
  cp_agent        VARCHAR(10)  NOT NULL,
  date_jour       DATE         NOT NULL,
  famille         ENUM('PRCI','PAR') NOT NULL,
  avant_equipe    VARCHAR(10)  DEFAULT NULL COMMENT 'NULL = la ligne n''existait pas avant cet import',
  avant_js_code   VARCHAR(20)  DEFAULT NULL,
  avant_horaires  VARCHAR(50)  DEFAULT NULL,
  apres_equipe    VARCHAR(10)  NOT NULL,
  apres_js_code   VARCHAR(20)  DEFAULT NULL,
  apres_horaires  VARCHAR(50)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_cps_detail_batch (batch_id),
  CONSTRAINT fk_cps_detail_batch FOREIGN KEY (batch_id) REFERENCES cps_import_batch(id) ON DELETE CASCADE,
  CONSTRAINT fk_cps_detail_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
