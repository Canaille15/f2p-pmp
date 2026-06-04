const router = require('express').Router();
const c = require('../controllers/profilController');
const { authMiddleware } = require('../middleware/auth');

router.get('/:cp',                   authMiddleware, c.getProfil);
router.put('/:cp',                   authMiddleware, c.updateProfil);
router.post('/:cp/roulement',        authMiddleware, c.setRoulement);
router.get('/:cp/roulement/actif',   authMiddleware, c.getRoulementActif);
router.put('/:cp/habilitations',     authMiddleware, c.setHabilitations);
router.post('/:cp/famille',          authMiddleware, c.addFamille);

module.exports = router;
