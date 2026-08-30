const router = require('express').Router();
const {
  getAgentsVisibles,
  getAnnuairePdfData,
  getUo, createUo, updateUo, deleteUo,
  getAccesRapide, createAccesRapide, updateAccesRapide, deleteAccesRapide,
} = require('../controllers/annuaireController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Agents — lecture seule, filtrés sur annuaire_visible=1 (authMiddleware suffit,
// pas de restriction admin : tout agent connecté consulte l'annuaire)
router.get('/agents', authMiddleware, getAgentsVisibles);

// Annuaire téléphonique imprimable (29/08) — admin-only, TOUS les agents
// actifs (nom+prénom, téléphone seulement si consenti), pour le générateur
// PDF du panneau Admin.
router.get('/agents-pdf', authMiddleware, adminMiddleware, getAnnuairePdfData);

// UO (unités opérationnelles) — modifiable par TOUT agent connecté (choix
// produit du 04/07/2026, volontairement pas d'adminMiddleware ici)
router.get('/uo',        authMiddleware, getUo);
router.post('/uo',       authMiddleware, createUo);
router.patch('/uo/:id',  authMiddleware, updateUo);
router.delete('/uo/:id', authMiddleware, deleteUo);

// Accès rapide — modifiable par TOUT agent connecté
router.get('/acces-rapide',        authMiddleware, getAccesRapide);
router.post('/acces-rapide',       authMiddleware, createAccesRapide);
router.patch('/acces-rapide/:id',  authMiddleware, updateAccesRapide);
router.delete('/acces-rapide/:id', authMiddleware, deleteAccesRapide);

module.exports = router;
