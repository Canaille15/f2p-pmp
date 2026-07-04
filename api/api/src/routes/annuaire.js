const router = require('express').Router();
const {
  getAgentsVisibles,
  getUo, createUo, updateUo, deleteUo,
  getAccesRapide, createAccesRapide, updateAccesRapide, deleteAccesRapide,
} = require('../controllers/annuaireController');
const { authMiddleware } = require('../middleware/auth');

// Agents — lecture seule, filtrés sur annuaire_visible=1 (authMiddleware suffit,
// pas de restriction admin : tout agent connecté consulte l'annuaire)
router.get('/agents', authMiddleware, getAgentsVisibles);

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
