const router = require('express').Router();
const { getAleas, createAlea, updateAlea, deleteAlea } = require('../controllers/aleasController');
const { authMiddleware } = require('../middleware/auth');
router.get('/',        authMiddleware, getAleas);
router.post('/',       authMiddleware, createAlea);
router.patch('/:id',   authMiddleware, updateAlea);
router.delete('/:id',  authMiddleware, deleteAlea);
module.exports = router;
