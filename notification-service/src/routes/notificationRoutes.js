import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getNotifications, markRead } from '../controllers/notificationController.js';

const router = Router();

router.get('/notifications', requireAuth, getNotifications);
router.put('/notifications/:id/read', requireAuth, markRead);

export default router;
