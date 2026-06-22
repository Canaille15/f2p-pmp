const router = require('express').Router();
const { getPlanning, getAllPublic, setJour, deleteJour } = require('../controllers/planningController');
const { authMiddleware } = require('../middleware/auth');
router.get('/public',       authMiddleware, getAllPublic);
router.get('/:cp',          authMiddleware, getPlanning);
router.put('/:cp/:date',    authMiddleware, setJour);
router.delete('/:cp/:date', authMiddleware, deleteJour);
module.exports = router;
