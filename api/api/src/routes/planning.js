const router = require('express').Router();
const { getPlanning, getAllPublic, setJour, deleteJour, bulkFill, bulkClear, bulkClearUndo } = require('../controllers/planningController');
const { authMiddleware } = require('../middleware/auth');
router.get('/public',       authMiddleware, getAllPublic);
router.get('/:cp',          authMiddleware, getPlanning);
router.put('/:cp/:date',    authMiddleware, setJour);
router.delete('/:cp/:date', authMiddleware, deleteJour);
// Module "Remplissage rapide" (24/08)
router.post('/:cp/bulk-fill',                 authMiddleware, bulkFill);
router.post('/:cp/bulk-clear',                authMiddleware, bulkClear);
router.post('/:cp/bulk-clear/:batchId/undo',  authMiddleware, bulkClearUndo);
module.exports = router;
