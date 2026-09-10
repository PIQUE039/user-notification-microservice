import { connect, JSONCodec } from 'nats';
import fs from 'fs';
import { randomUUID } from 'crypto';

const jc = JSONCodec();

let nc = null;
let js = null;

function buildConnectOptions() {
  const opts = {
    servers: process.env.NATS_URL || 'nats://localhost:4222',
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASSWORD,
    name: 'user-service',
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

export async function connectNats() {
  if (nc) return { nc, js };

  nc = await connect(buildConnectOptions());
  js = nc.jetstream();

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

  (async () => {
    for await (const status of nc.status()) {
      console.log(`[user-service][nats] ${status.type}`, status.data ?? '');
    }
  })().catch(() => {});

  console.log('[user-service] connected to NATS JetStream');
  return { nc, js };
}

export async function publishUserEvent(eventType, payload) {
  if (!js) throw new Error('NATS JetStream not connected - call connectNats() first');

  const subjectPrefix = process.env.NATS_SUBJECT_PREFIX || 'user';
  const subject = `${subjectPrefix}.${eventType}`;

  const event = {
    eventId: randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    data: payload
  };

  const ack = await js.publish(subject, jc.encode(event));
  console.log(`[user-service] published ${subject} (stream=${ack.stream}, seq=${ack.seq})`);
  return ack;
}

export async function closeNats() {
  if (nc) {
    await nc.drain();
    nc = null;
    js = null;
  }
}
