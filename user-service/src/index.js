import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import userRoutes from './routes/userRoutes.js';
import { checkDbConnection } from './db/pool.js';
import { connectNats, closeNats } from './messaging/publisher.js';

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 4001;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', async (req, res) => {
  try {
    await checkDbConnection();
    res.status(200).json({ status: 'ok', service: 'user-service' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', service: 'user-service', error: err.message });
  }
});

app.use('/', userRoutes);

// Central error handler - keeps stack traces out of client responses.
app.use((err, req, res, next) => {
  console.error('[user-service] unhandled error', err);
  res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

async function start() {
  try {
    await checkDbConnection();
    console.log('[user-service] connected to Postgres');
    await connectNats();
    app.listen(PORT, () => console.log(`[user-service] listening on port ${PORT}`));
  } catch (err) {
    console.error('[user-service] failed to start', err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('[user-service] SIGTERM received, shutting down gracefully');
  await closeNats();
  process.exit(0);
});

start();
