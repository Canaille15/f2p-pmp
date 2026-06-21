const router = require('express').Router();
const { getAleas, createAlea, deleteAlea } = require('../controllers/aleasController');
const { authMiddleware } = require('../middleware/auth');
router.get('/',        authMiddleware, getAleas);
router.post('/',       authMiddleware, createAlea);
router.delete('/:id',  authMiddleware, deleteAlea);
module.exports = router;
