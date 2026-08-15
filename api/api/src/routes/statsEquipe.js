const router = require('express').Router();
const { getStats } = require('../controllers/statsEquipeController');
const { authMiddleware } = require('../middleware/auth');

// Ouvert à tout agent connecté — aucune donnée nominative n'y transite
// (congés/VT refusés sont renvoyés sous forme de totaux anonymisés).
router.get('/', authMiddleware, getStats);

module.exports = router;
