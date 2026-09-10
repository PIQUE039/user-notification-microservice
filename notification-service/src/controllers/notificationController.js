import { listNotificationsForUser, markNotificationRead } from '../models/notificationModel.js';

export async function getNotifications(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const notifications = await listNotificationsForUser(req.user.id, { limit, offset });
    return res.status(200).json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'not_found', message: 'Notification not found' });
    }
    return res.status(200).json({ notification });
  } catch (err) {
    next(err);
  }
}
