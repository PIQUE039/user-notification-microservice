import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail, findUserById, updateUserProfile } from '../models/userModel.js';
import { publishUserEvent } from '../messaging/publisher.js';

const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'email_taken', message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser({ name, email, passwordHash });

    // Fire-and-track: publish to NATS JetStream, not a direct call to the
    // Notification Service. If this fails we still return 201 - the user
    // record is the source of truth, and JetStream's own durability plus
    // our stream retention means we don't lose the event if the publish
    // itself succeeded; a hard publish failure is logged for follow-up
    // rather than failing the user's registration.
    try {
      await publishUserEvent('created', { userId: user.id, name: user.name, email: user.email });
    } catch (publishErr) {
      console.error('[user-service] failed to publish user.created event', publishErr);
    }

    const token = signToken(user);
    return res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Email or password is incorrect' });
    }

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;
    return res.status(200).json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { name } = req.body;
    const user = await updateUserProfile(req.user.id, { name });
    if (!user) {
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }

    try {
      await publishUserEvent('updated', { userId: user.id, name: user.name, email: user.email });
    } catch (publishErr) {
      console.error('[user-service] failed to publish user.updated event', publishErr);
    }

    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}
