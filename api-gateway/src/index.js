import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import proxyRoutes from './routes/proxy.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 8080;

app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(apiRateLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

app.use(proxyRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

app.listen(PORT, () => console.log(`[api-gateway] listening on port ${PORT}`));
