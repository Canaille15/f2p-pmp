const router = require('express').Router();
const { getAll, getOne, update } = require('../controllers/agentController');
const { authMiddleware } = require('../middleware/auth');
router.get('/',      authMiddleware, getAll);
router.get('/:cp',   authMiddleware, getOne);
router.patch('/:cp', authMiddleware, update);
module.exports = router;
