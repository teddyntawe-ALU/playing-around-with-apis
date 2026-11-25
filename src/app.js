// Express application factory. Kept separate from server.js so tests can build an app with a
// fake openFDA client and exercise it without opening a network port.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import { createCache } from './services/cache.js';
import { createOpenFdaClient } from './services/openfdaClient.js';
import { drugsRouter } from './routes/drugs.js';
import { recallsRouter } from './routes/recalls.js';
import { healthRouter } from './routes/health.js';
import { AppError } from './utils/errors.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

export function createApp(config, { fetchImpl, logger = console } = {}) {
  const cache = createCache(config.cache);
  const client = createOpenFdaClient({ ...config.openFda, cache, fetchImpl });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null, // the servers may be reached over plain HTTP
        },
      },
      strictTransportSecurity: false, // set at the load balancer once HTTPS is terminated there
    }),
  );

  // Identify which application server produced each response (visible through the load balancer).
  app.use((req, res, next) => {
    res.set('X-Served-By', config.serverName);
    next();
  });

  if (config.env !== 'test') {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms ip=${req.ip}`);
      });
      next();
    });
  }

  app.use('/api/health', healthRouter({ serverName: config.serverName, version }));
  app.use('/api/drugs', drugsRouter({ client }));
  app.use('/api/recalls', recallsRouter({ client }));
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint.' } });
  });

  app.use(
    express.static(path.join(rootDir, 'public'), {
      maxAge: config.env === 'production' ? '1h' : 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
      },
    }),
  );

  // Central error handler: every failure leaves the API as { error: { code, message } }.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logger.warn(`[${err.code}] ${req.method} ${req.originalUrl}`);
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err.type === 'entity.parse.failed' || err.status === 400) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Malformed request.' } });
    }
    logger.error(err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } });
  });

  return app;
}
