-- Table planning_cps : planning officiel SNCF importé via OCR
-- Une ligne par agent + jour + periode (similaire a planning_periode mais separee)
CREATE TABLE IF NOT EXISTS planning_cps (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  cp_agent        VARCHAR(10)   NOT NULL,
  date_jour       DATE          NOT NULL,
  equipe          VARCHAR(10)   NOT NULL COMMENT 'M|AM|N|J',
  js_code         VARCHAR(20)   DEFAULT NULL,
  horaires        VARCHAR(50)   DEFAULT NULL,
  famille         ENUM('PRCI','PAR') NOT NULL,
  importe_le      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  importe_par     VARCHAR(10)   DEFAULT NULL COMMENT 'cp_agent admin qui a fait import',
  PRIMARY KEY (id),
  UNIQUE KEY uq_cps_agent_jour (cp_agent, date_jour),
  KEY idx_cps_date (date_jour),
  KEY idx_cps_agent_date (cp_agent, date_jour),
  CONSTRAINT fk_cps_agent FOREIGN KEY (cp_agent) REFERENCES agent(cp) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
