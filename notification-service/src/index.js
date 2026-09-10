import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import notificationRoutes from './routes/notificationRoutes.js';
import { checkDbConnection } from './db/pool.js';
import { connectAndSubscribe, closeNats } from './messaging/subscriber.js';

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 4002;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', async (req, res) => {
  try {
    await checkDbConnection();
    res.status(200).json({ status: 'ok', service: 'notification-service' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', service: 'notification-service', error: err.message });
  }
});

app.use('/', notificationRoutes);

app.use((err, req, res, next) => {
  console.error('[notification-service] unhandled error', err);
  res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

async function start() {
  try {
    await checkDbConnection();
    console.log('[notification-service] connected to Postgres');
    await connectAndSubscribe();
    app.listen(PORT, () => console.log(`[notification-service] listening on port ${PORT}`));
  } catch (err) {
    console.error('[notification-service] failed to start', err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('[notification-service] SIGTERM received, shutting down gracefully');
  await closeNats();
  process.exit(0);
});

start();
