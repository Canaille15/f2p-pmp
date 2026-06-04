const router = require('express').Router();
const { login, logout, changePin } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
router.post('/login',      loginLimiter,   login);
router.post('/logout',     authMiddleware, logout);
router.post('/change-pin', authMiddleware, changePin);
module.exports = router;
