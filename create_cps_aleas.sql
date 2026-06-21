CREATE TABLE cps_aleas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  js_code VARCHAR(20) NOT NULL,
  date_jour DATE NOT NULL,
  famille ENUM('PRCI','PAR') NOT NULL,
  type ENUM('echange','erreur_cps','non_tenu') NOT NULL,
  agents_concernes JSON DEFAULT NULL COMMENT 'Liste des CP des agents qui assurent reellement le poste',
  motif TEXT DEFAULT NULL,
  signale_par VARCHAR(10) NOT NULL,
  signale_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_poste_date (js_code, date_jour, famille)
);
