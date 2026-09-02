const router = require('express').Router();
const { track, getStats } = require('../controllers/usageController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.post('/track', authMiddleware, track);
router.get('/stats',  authMiddleware, adminMiddleware, getStats);

module.exports = router;
