// /api/drugs — search FDA drug labels and fetch a single label's full text.
import { Router } from 'express';
import { buildLabelQuery, PRODUCT_TYPES } from '../services/queries.js';
import { toLabelDetail, toLabelSummary } from '../services/transform.js';
import { notFound } from '../utils/errors.js';
import {
  parseBoolean,
  parseEnum,
  parseInteger,
  parseLabelId,
  parseRoute,
  parseSearchTerm,
} from '../utils/validate.js';

export function drugsRouter({ client }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = parseSearchTerm(req.query.q);
    const route = parseRoute(req.query.route);
    const productType = parseEnum(req.query.type, 'type', Object.keys(PRODUCT_TYPES));
    const limit = parseInteger(req.query.limit, 'limit', { min: 1, max: 100, fallback: 24 });
    const skip = parseInteger(req.query.skip, 'skip', { min: 0, max: 25000, fallback: 0 });

    const { search, sort } = buildLabelQuery({ q, route, productType });
    const data = await client.searchLabels(
      { search, sort, limit, skip },
      { bypassCache: parseBoolean(req.query.refresh) },
    );

    const results = data.results.map(toLabelSummary);
    res.json({
      meta: {
        total: data.total,
        skip,
        limit,
        count: results.length,
        cached: data.cached,
        lastUpdated: data.lastUpdated,
        query: { q, route, type: productType },
      },
      results,
    });
  });

  router.get('/:id', async (req, res) => {
    const id = parseLabelId(req.params.id);
    const data = await client.searchLabels({ search: `id:"${id}"`, limit: 1 });
    if (data.results.length === 0) throw notFound('That medication label could not be found.');
    res.json({ meta: { cached: data.cached, lastUpdated: data.lastUpdated }, result: toLabelDetail(data.results[0]) });
  });

  return router;
}
