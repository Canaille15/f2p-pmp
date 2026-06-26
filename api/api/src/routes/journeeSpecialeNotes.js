const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getAll, upsert, remove } = require('../controllers/journeeSpecialeNotesController');
router.get('/', authMiddleware, getAll);
router.post('/', authMiddleware, upsert);
router.delete('/:id', authMiddleware, remove);
module.exports = router;
