import type { Request } from 'express';
import {
  stringQuery,
  stringField,
  safeLanguage,
  boundUtf8,
  byteLength,
  type JsonRecord,
} from '../../../system/core/interceptors/http-log-values';

const MAX_LOOKUP_TEXT_BYTES = 1024;

export function dictionaryLookupDetails(
  request: Request,
  includeContent: boolean,
): JsonRecord {
  const query = stringQuery(request.query);
  const word = stringField(query, 'word');
  const boundedWord = boundUtf8(word, MAX_LOOKUP_TEXT_BYTES);
  return {
    query_parameters: {
      language: safeLanguage(query['language']),
      word_bytes: byteLength(word),
      ...(includeContent && word !== undefined
        ? { word: boundedWord.value, word_truncated: boundedWord.truncated }
        : {}),
    },
    query_content_capture_enabled: includeContent,
  };
}
