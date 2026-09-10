import { pool } from '../db/pool.js';

/**
 * Inserts a notification derived from a NATS event. ON CONFLICT DO NOTHING
 * against the unique (source_event_id) index makes this idempotent: if
 * JetStream redelivers the same event (at-least-once delivery), we simply
 * no-op instead of creating a duplicate notification.
 */
export async function createNotificationFromEvent({ userId, type, message, sourceEventId }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, message, source_event_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING
     RETURNING id, user_id, type, message, is_read, created_at`,
    [userId, type, message, sourceEventId]
  );
  return rows[0] || null; // null means it was a duplicate delivery, which is fine
}

export async function listNotificationsForUser(userId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, user_id, type, message, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

export async function markNotificationRead(id, userId) {
  const { rows } = await pool.query(
    `UPDATE notifications SET is_read = true
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, type, message, is_read, created_at`,
    [id, userId]
  );
  return rows[0] || null;
}
