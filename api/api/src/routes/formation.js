const router = require('express').Router();
const {
  getCatalogue, createCatalogue, updateCatalogue, deleteCatalogue,
  getSessions, getSessionDetail, createSession, updateSession, deleteSession,
  addFormateur, removeFormateur, addParticipant, removeParticipant, lancerSession,
  getMesSessions, declarerFormationPerso, getStats,
} = require('../controllers/formationController');
const { authMiddleware, afoMiddleware } = require('../middleware/auth');

// Catalogue — consultable par tous les agents connectés, modifiable par les AFO
router.get('/catalogue',        authMiddleware, getCatalogue);
router.post('/catalogue',       authMiddleware, afoMiddleware, createCatalogue);
router.put('/catalogue/:id',    authMiddleware, afoMiddleware, updateCatalogue);
router.delete('/catalogue/:id', authMiddleware, afoMiddleware, deleteCatalogue);

// Sessions — réservé aux AFO (gestion). Tous les AFO ont les mêmes droits.
router.get('/sessions',                       authMiddleware, afoMiddleware, getSessions);
router.get('/sessions/:id',                   authMiddleware, afoMiddleware, getSessionDetail);
router.post('/sessions',                      authMiddleware, afoMiddleware, createSession);
router.put('/sessions/:id',                   authMiddleware, afoMiddleware, updateSession);
router.delete('/sessions/:id',                 authMiddleware, afoMiddleware, deleteSession);
router.post('/sessions/:id/formateurs',       authMiddleware, afoMiddleware, addFormateur);
router.delete('/sessions/:id/formateurs/:cp', authMiddleware, afoMiddleware, removeFormateur);
router.post('/sessions/:id/participants',     authMiddleware, afoMiddleware, addParticipant);
router.delete('/sessions/:id/participants/:cp', authMiddleware, afoMiddleware, removeParticipant);
router.post('/sessions/:id/lancer',           authMiddleware, afoMiddleware, lancerSession);

// Vue agent — archive personnelle, pas de restriction AFO (self uniquement, cp pris du token)
router.get('/mes-sessions', authMiddleware, getMesSessions);
router.post('/perso',       authMiddleware, declarerFormationPerso);

// Stats — réservé aux AFO, tous à égalité (voir tous les AFO, pas seulement soi)
router.get('/stats', authMiddleware, afoMiddleware, getStats);

module.exports = router;
