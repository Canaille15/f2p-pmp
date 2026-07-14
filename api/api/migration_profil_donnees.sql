-- Ajoute une colonne JSON unique sur profil_agent pour stocker tous les champs
-- "flexibles" du profil qui n'avaient jamais de colonne dédiée côté backend
-- (Acquis/Reports Congés-RP-RU-RQ-RN-TC-TY, Pause Figée, Fêtes, etc.)
-- => corrige le bug de synchronisation multi-appareil (données restées locales
--    au localStorage, jamais réellement enregistrées en base).
ALTER TABLE profil_agent
  ADD COLUMN donnees_json JSON DEFAULT NULL AFTER couleurs;
