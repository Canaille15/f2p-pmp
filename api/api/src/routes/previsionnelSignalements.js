const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getAll, create, remove } = require('../controllers/previsionnelSignalementsController');

router.get('/', authMiddleware, getAll);
router.post('/', authMiddleware, create);
router.delete('/:id', authMiddleware, remove);

module.exports = router;
