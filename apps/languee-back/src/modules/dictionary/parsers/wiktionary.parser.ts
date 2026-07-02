import { Logger } from '@nestjs/common';
import { RawDefinitionEntry } from '../interfaces/dictionary-api-adapter.interface';
import { mapWiktionaryPos } from '../mappers/wiktionary-pos.mapper';

const logger = new Logger('WiktionaryParser');

const HTML_TAG_REGEX = /<[^>]+>/g;
const WHITESPACE_REGEX = /\s+/g;
const HTML_ENTITY_REGEX = /&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Strips HTML tags and decodes common entities from a Wiktionary REST API
 * definition/example fragment, collapsing whitespace runs.
 */
export function stripWiktionaryHtml(html: string): string {
  return html
    .replace(HTML_TAG_REGEX, '')
    .replace(HTML_ENTITY_REGEX, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(WHITESPACE_REGEX, ' ')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractRawExample(
  definitionRecord: Record<string, unknown>,
): string | undefined {
  const parsedExamples = definitionRecord['parsedExamples'];
  if (Array.isArray(parsedExamples)) {
    for (const parsedExample of parsedExamples) {
      if (
        isRecord(parsedExample) &&
        typeof parsedExample['example'] === 'string'
      ) {
        return parsedExample['example'];
      }
    }
  }

  const examples = definitionRecord['examples'];
  if (Array.isArray(examples)) {
    for (const example of examples) {
      if (typeof example === 'string') {
        return example;
      }
    }
  }

  return undefined;
}

function parseUsage(usage: unknown): RawDefinitionEntry[] {
  if (!isRecord(usage)) {
    return [];
  }

  const rawPartOfSpeech = usage['partOfSpeech'];
  if (typeof rawPartOfSpeech !== 'string') {
    return [];
  }

  const partOfSpeech = mapWiktionaryPos(rawPartOfSpeech);
  if (partOfSpeech === null) {
    logger.debug({
      message: 'unrecognised part of speech, skipping usage',
      event: 'wiktionary.pos_skipped',
      method: parseUsage.name,
      data: { partOfSpeech: rawPartOfSpeech },
    });
    return [];
  }

  const definitions = usage['definitions'];
  if (!Array.isArray(definitions)) {
    return [];
  }

  const entries: RawDefinitionEntry[] = [];
  for (const rawDefinition of definitions) {
    if (
      !isRecord(rawDefinition) ||
      typeof rawDefinition['definition'] !== 'string'
    ) {
      continue;
    }

    const definition = stripWiktionaryHtml(rawDefinition['definition']);
    if (definition.length === 0) {
      continue;
    }

    const rawExample = extractRawExample(rawDefinition);
    const example =
      rawExample !== undefined ? stripWiktionaryHtml(rawExample) : undefined;

    entries.push({
      partOfSpeech,
      definition,
      ...(example !== undefined && example.length > 0 ? { example } : {}),
    });
  }

  return entries;
}

/**
 * Parses a Wiktionary REST API `/page/definition/{term}` response body into
 * RawDefinitionEntry[] for the given language code. Defensive throughout —
 * malformed or unexpected shapes are skipped rather than throwing.
 */
export function parseWiktionaryResponse(
  body: unknown,
  language: string,
): RawDefinitionEntry[] {
  if (!isRecord(body)) {
    return [];
  }

  const usages = body[language];
  if (!Array.isArray(usages)) {
    return [];
  }

  return usages.flatMap((usage) => parseUsage(usage));
}
