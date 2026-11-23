import type { Request } from 'express';
import {
  stringQuery,
  safeCode,
  type JsonRecord,
} from '../../system/core/interceptors/http-log-values';

export function cardsDetails(request: Request): JsonRecord {
  const query = stringQuery(request.query);
  const status = query['ankiDroidExportStatus'];
  const failureReason = safeCode(query['failureReason']);
  return {
    has_deck_filter: typeof query['deckId'] === 'string',
    ...(typeof status === 'string' &&
    ['none', 'pending', 'completed', 'failed'].includes(status)
      ? { anki_droid_export_status: status }
      : {}),
    ...(failureReason === undefined ? {} : { failure_reason: failureReason }),
  };
}
