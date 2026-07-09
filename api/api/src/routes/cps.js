const router = require('express').Router();
const { getCps, importCps, getLastImport, getImportHistory, undoLastImport } = require('../controllers/cpsController');
const { authMiddleware } = require('../middleware/auth');
router.get('/',            authMiddleware, getCps);
router.get('/last-import', authMiddleware, getLastImport);
router.get('/history',     authMiddleware, getImportHistory);
router.post('/import',     authMiddleware, importCps);
router.post('/undo-last',  authMiddleware, undoLastImport);
module.exports = router;
