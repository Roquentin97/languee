import type { Request } from 'express';
import {
  stringQuery,
  type JsonRecord,
} from '../../system/core/interceptors/http-log-values';

export function reviewQueueDetails(request: Request): JsonRecord {
  const query = stringQuery(request.query);
  const limit = query['limit'];
  return {
    has_deck_filter: typeof query['deckId'] === 'string',
    ...(typeof limit === 'string' && /^\d{1,3}$/.test(limit)
      ? { limit: Number(limit) }
      : {}),
  };
}
