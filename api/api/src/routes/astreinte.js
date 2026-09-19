const router = require('express').Router();
const { getAgents, createAgent, updateAgent, deleteAgent, getSchedule, setJour, setSemaine } = require('../controllers/astreinteController');
const { authMiddleware } = require('../middleware/auth');

router.get('/agents',        authMiddleware, getAgents);
router.post('/agents',       authMiddleware, createAgent);
router.put('/agents/:id',    authMiddleware, updateAgent);
router.delete('/agents/:id', authMiddleware, deleteAgent);

router.get('/',              authMiddleware, getSchedule);
router.put('/:date',         authMiddleware, setJour);
router.post('/semaine',      authMiddleware, setSemaine);

module.exports = router;
