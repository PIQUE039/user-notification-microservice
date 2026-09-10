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

// Gateway-level health check. Does not proxy - a health check dependent on
// downstream services would report the gateway "down" whenever a service
// restarts, which is misleading. Each service exposes its own /health too.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

// NOTE: body parsing is intentionally NOT applied globally here. The proxy
// middleware streams the raw request body straight to the downstream
// service; parsing it here and re-serializing it is a common source of
// subtle bugs (wrong Content-Length, lost fields) in gateways.
app.use(proxyRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' });
});

app.listen(PORT, () => console.log(`[api-gateway] listening on port ${PORT}`));
