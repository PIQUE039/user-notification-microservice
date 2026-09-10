import jwt from 'jsonwebtoken';

/**
 * Gatekeeper for protected routes. Public routes (register/login) skip this
 * entirely. Everything else must carry a valid Bearer token before the
 * gateway will even open a proxy connection to a downstream service -
 * unauthenticated traffic never reaches User Service or Notification
 * Service at all.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or malformed Authorization header' });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}
