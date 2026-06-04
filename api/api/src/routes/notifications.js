const router = require('express').Router();
const c = require('../controllers/notificationsController');
const { authMiddleware } = require('../middleware/auth');

router.get('/:cp',                   authMiddleware, c.getNotifications);
router.post('/:cp',                  authMiddleware, c.createNotification);
router.patch('/:cp/:id/acquitter',   authMiddleware, c.acquitter);
router.patch('/:cp/:id/snooze',      authMiddleware, c.snooze);

module.exports = router;
