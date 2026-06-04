const router = require('express').Router();
const c = require('../controllers/fetesController');
const { authMiddleware } = require('../middleware/auth');

router.get('/:cp/:annee',       authMiddleware, c.getSuivi);
router.put('/:cp/:annee/:code', authMiddleware, c.upsertSuivi);

module.exports = router;
