const router = require('express').Router();
const c = require('../controllers/congesController');
const { authMiddleware } = require('../middleware/auth');

router.get('/:cp',                authMiddleware, c.getConges);
router.post('/:cp',               authMiddleware, c.createDemande);
router.patch('/:cp/:id',          authMiddleware, c.updateDemande);
router.patch('/:cp/reliquats/:id',authMiddleware, c.updateReliquat);

module.exports = router;
