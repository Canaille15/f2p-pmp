const router = require('express').Router();
const { getPlanning, setJour, deleteJour } = require('../controllers/planningController');
const { authMiddleware } = require('../middleware/auth');
router.get('/:cp',          authMiddleware, getPlanning);
router.put('/:cp/:date',    authMiddleware, setJour);
router.delete('/:cp/:date', authMiddleware, deleteJour);
module.exports = router;
