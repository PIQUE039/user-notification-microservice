import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getNotifications, markRead } from '../controllers/notificationController.js';

const router = Router();

// A user can only ever read their own notifications - req.user.id comes
// from the verified JWT, never from the URL, so there is no way to pass
// someone else's id and read their notifications.
router.get('/notifications', requireAuth, getNotifications);
router.put('/notifications/:id/read', requireAuth, markRead);

export default router;
