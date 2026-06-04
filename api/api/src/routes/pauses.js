const router = require('express').Router();
const c = require('../controllers/pausesController');
const { authMiddleware } = require('../middleware/auth');

router.get('/:cp',          authMiddleware, c.getPauses);
router.put('/:cp/:date',    authMiddleware, c.upsertPause);
router.delete('/:cp/:date', authMiddleware, c.deletePause);

module.exports = router;
