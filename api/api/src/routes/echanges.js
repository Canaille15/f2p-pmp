const router = require('express').Router();
const c = require('../controllers/echangesController');
const { authMiddleware } = require('../middleware/auth');

router.get('/',                  authMiddleware, c.getEchanges);
router.get('/:id/interesses',    authMiddleware, c.getInteresses);
router.post('/',                 authMiddleware, c.createEchange);
router.put('/:id',               authMiddleware, c.updateEchange);
router.post('/:id/interet',      authMiddleware, c.toggleInteret);
router.post('/:id/cloturer',     authMiddleware, c.cloturer);
router.delete('/:id',            authMiddleware, c.deleteEchange);

module.exports = router;
