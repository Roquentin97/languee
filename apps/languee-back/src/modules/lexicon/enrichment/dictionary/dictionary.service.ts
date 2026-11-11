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
      input: input.word,
      language: input.language,
      kind: input.kind,
      source: result.source,
      preferred: { wordId: selected.wordId, partOfSpeech: null },
      headwords: result.headwords.map((headword) => ({
        wordId: headword.wordId,
        lemma: headword.lemma,
        language: input.language,
        relations: headword.relations,
        partsOfSpeech: [
          ...new Set(headword.definitions.map((d) => d.partOfSpeech)),
        ].map((partOfSpeech) => ({
          partOfSpeech,
          definitions: headword.definitions.filter(
            (d) => d.partOfSpeech === partOfSpeech,
          ),
        })),
      })),
    };
  }
}
