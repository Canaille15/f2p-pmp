const router = require('express').Router();
const c = require('../controllers/echangesController');
const { authMiddleware } = require('../middleware/auth');

router.get('/',             authMiddleware, c.getEchanges);
router.post('/',            authMiddleware, c.createEchange);
router.post('/:id/candidater', authMiddleware, c.candidater);
router.post('/:id/valider',    authMiddleware, c.valider);
router.patch('/:id/repondre',  authMiddleware, c.repondre);

module.exports = router;
