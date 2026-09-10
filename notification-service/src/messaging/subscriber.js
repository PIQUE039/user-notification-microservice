import { connect, JSONCodec, consumerOpts, createInbox } from 'nats';
import fs from 'fs';
import { createNotificationFromEvent } from '../models/notificationModel.js';

const jc = JSONCodec();

let nc = null;

function buildConnectOptions() {
  const opts = {
    servers: process.env.NATS_URL || 'nats://localhost:4222',
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASSWORD,
    name: 'notification-service',
    reconnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000
  };

  if ((process.env.NATS_TLS_ENABLED || 'true') === 'true') {
    opts.tls = {};
    if (process.env.NATS_CA_CERT_PATH && fs.existsSync(process.env.NATS_CA_CERT_PATH)) {
      opts.tls.caFile = process.env.NATS_CA_CERT_PATH;
    }
  }

  return opts;
}

/**
 * Turns a raw user.* domain event into a human-readable notification.
 * Keeping this mapping isolated makes it trivial to add new event types
 * later (user.deleted, user.password_reset, ...) without touching the
 * transport/ack logic below.
 */
function toNotification(eventType, data) {
  switch (eventType) {
    case 'created':
      return { type: 'welcome', message: `Welcome, ${data.name}! Your account has been created.` };
    case 'updated':
      return { type: 'profile_updated', message: `Hi ${data.name}, your profile was updated.` };
    default:
      return { type: eventType, message: `Event received: ${eventType}` };
  }
}

async function handleMessage(msg) {
  const subjectPrefix = process.env.NATS_SUBJECT_PREFIX || 'user';
  const eventType = msg.subject.slice(subjectPrefix.length + 1); // "user.created" -> "created"

  let event;
  try {
    event = jc.decode(msg.data);
  } catch (err) {
    // Malformed payload can never be processed successfully - ack it so it
    // doesn't clog the consumer with endless redeliveries, but log loudly.
    console.error(`[notification-service] failed to decode message on ${msg.subject}, dropping`, err);
    msg.ack();
    return;
  }

  try {
    const { type, message } = toNotification(eventType, event.data);
    const result = await createNotificationFromEvent({
      userId: event.data.userId,
      type,
      message,
      sourceEventId: event.eventId
    });

    if (result) {
      console.log(`[notification-service] created notification ${result.id} for user ${result.user_id}`);
    } else {
      console.log(`[notification-service] duplicate event ${event.eventId} ignored (already processed)`);
    }

    msg.ack();
  } catch (err) {
    console.error(`[notification-service] failed to process event ${event?.eventId}, will retry`, err);
    // Explicit negative ack: JetStream redelivers per the consumer's
    // max_deliver / backoff policy instead of losing the message.
    msg.nak();
  }
}

export async function connectAndSubscribe() {
  nc = await connect(buildConnectOptions());
  console.log('[notification-service] connected to NATS JetStream');

  const jsm = await nc.jetstreamManager();
  const streamName = process.env.NATS_STREAM_NAME || 'USER_EVENTS';
  const subjectPrefix = process.env.NATS_SUBJECT_PREFIX || 'user';

  await jsm.streams.add({
    name: streamName,
    subjects: [`${subjectPrefix}.>`],
    retention: 'limits',
    max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
    storage: 'file'
  }).catch(async (err) => {
    if (!String(err.message || '').includes('already in use')) throw err;
  });

  const js = nc.jetstream();

  const opts = consumerOpts();
  opts.durable('notification-worker'); // durable name: consumer position survives restarts
  opts.manualAck();
  opts.ackExplicit();
  opts.ackWait(30 * 1000); // 30s to ack before JetStream considers it unacked and redelivers
  opts.maxDeliver(5); // after 5 failed attempts, stop redelivering (would route to a DLQ in a fuller build)
  opts.deliverTo(createInbox());
  opts.deliverAll();
  opts.callback((err, msg) => {
    if (err) {
      console.error('[notification-service] subscription error', err);
      return;
    }
    handleMessage(msg).catch((e) => console.error('[notification-service] unhandled handler error', e));
  });

  await js.subscribe(`${subjectPrefix}.>`, opts);
  console.log(`[notification-service] subscribed to "${subjectPrefix}.>" as durable consumer "notification-worker"`);

  (async () => {
    for await (const status of nc.status()) {
      console.log(`[notification-service][nats] ${status.type}`, status.data ?? '');
    }
  })().catch(() => {});
}

export async function closeNats() {
  if (nc) {
    await nc.drain();
    nc = null;
  }
}
