import jwt from 'jsonwebtoken';

/**
 * Verifies the JWT issued at login. The API Gateway also verifies this same
 * token before proxying, but the User Service re-verifies it independently -
 * a service should never trust an internal network boundary as its only
 * line of defense (defense in depth, not "the gateway already checked it").
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}
