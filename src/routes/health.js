// /api/health — liveness check used by the load balancer.
// It deliberately does NOT call openFDA: if the FDA API is down, both servers would be marked
// unhealthy and the load balancer would stop serving the app (and its friendly error messages).
import { Router } from 'express';

export function healthRouter({ serverName, version, startedAt = Date.now() }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      server: serverName,
      version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
