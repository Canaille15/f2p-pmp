const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth'); // adapter le nom si différent dans le projet
const { importBulletin } = require('../controllers/bulletinImportController');

router.post('/:cp/import-bulletin', authMiddleware, importBulletin);

module.exports = router;
