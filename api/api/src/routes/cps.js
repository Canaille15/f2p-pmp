const router = require('express').Router();
const { getCps, importCps } = require('../controllers/cpsController');
const { authMiddleware } = require('../middleware/auth');
router.get('/',        authMiddleware, getCps);
router.post('/import', authMiddleware, importCps);
module.exports = router;
