// /api/recalls — search FDA drug recall (enforcement) reports.
import { Router } from 'express';
import { buildRecallQuery, RECALL_CLASSES, RECALL_STATUSES } from '../services/queries.js';
import { toRecall } from '../services/transform.js';
import { parseBoolean, parseEnum, parseInteger, parseSearchTerm } from '../utils/validate.js';

export function recallsRouter({ client }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = parseSearchTerm(req.query.q);
    const classification = parseEnum(req.query.classification, 'classification', RECALL_CLASSES);
    const status = parseEnum(req.query.status, 'status', RECALL_STATUSES);
    const limit = parseInteger(req.query.limit, 'limit', { min: 1, max: 100, fallback: 24 });
    const skip = parseInteger(req.query.skip, 'skip', { min: 0, max: 25000, fallback: 0 });

    const { search, sort } = buildRecallQuery({ q, classification, status });
    const data = await client.searchRecalls(
      { search, sort, limit, skip },
      { bypassCache: parseBoolean(req.query.refresh) },
    );

    const results = data.results.map(toRecall);
    res.json({
      meta: {
        total: data.total,
        skip,
        limit,
        count: results.length,
        cached: data.cached,
        lastUpdated: data.lastUpdated,
        query: { q, classification, status },
      },
      results,
    });
  });

  return router;
}
