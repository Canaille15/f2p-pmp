const router = require('express').Router();
const { getAll, getOne, update, create, remove, resetPin } = require('../controllers/agentController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Routes publiques (authentification requise)
router.get('/',      authMiddleware, getAll);
router.get('/:cp',   authMiddleware, getOne);
router.patch('/:cp', authMiddleware, update);

// Routes admin uniquement
router.post('/',         authMiddleware, adminMiddleware, create);
router.delete('/:cp',    authMiddleware, adminMiddleware, remove);
router.put('/:cp/reset-pin', authMiddleware, adminMiddleware, resetPin);

module.exports = router;
