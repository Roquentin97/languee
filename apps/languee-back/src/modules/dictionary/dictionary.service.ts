import { Injectable } from '@nestjs/common';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { HeadwordDiscoveryService } from './headword-discovery.service';
import { normalizeSpelling } from '../morphology/morphology-provider';
import type {
  LookupWordInput,
  LookupWordOutput,
} from './types/lookup-word.types';

@Injectable()
export class DictionaryService {
  constructor(private readonly discovery: HeadwordDiscoveryService) {}

  async lookup(input: LookupWordInput): Promise<LookupWordOutput> {
    const surface =
      input.kind === 'word' ? input.word : (input.lemma ?? input.word);
    const result = await this.discovery.discover(
      surface,
      input.language,
      input.lemma,
      input.kind,
    );
    const selected =
      result.headwords.find(
        (w) => w.lemma === normalizeSpelling(input.lemma ?? surface),
      ) ??
      result.headwords.find((w) => w.lemma === normalizeSpelling(surface)) ??
      result.headwords[0];
    if (!selected)
      throw new DefinitionsNotFoundException(surface, input.language);
    return {
      lemma: selected.lemma,
      source: result.source,
      definitions: selected.definitions,
    };
  }
}
