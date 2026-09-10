import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const userServiceProxy = createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://user-service:4001',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: { '^/api/users': '' },
  onError: (err, req, res) => {
    console.error('[api-gateway] user-service proxy error', err.message);
    res.status(502).json({ error: 'bad_gateway', message: 'User service is unavailable' });
  }
});

const notificationServiceProxy = createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:4002',
  changeOrigin: true,
  logLevel: 'warn',
  pathRewrite: { '^/api/notifications': '/notifications' },
  onError: (err, req, res) => {
    console.error('[api-gateway] notification-service proxy error', err.message);
    res.status(502).json({ error: 'bad_gateway', message: 'Notification service is unavailable' });
  }
});

// Public: no auth required to create an account or log in.
router.use('/api/users/register', authRateLimiter, userServiceProxy);
router.use('/api/users/login', authRateLimiter, userServiceProxy);

// Everything else under /api/users/* requires a valid JWT.
router.use('/api/users', requireAuth, userServiceProxy);

// All notification routes require a valid JWT - a user can only ever
// fetch their own notifications (enforced downstream using the token's
// subject claim, not anything the client can pass in).
router.use('/api/notifications', requireAuth, notificationServiceProxy);

export default router;
