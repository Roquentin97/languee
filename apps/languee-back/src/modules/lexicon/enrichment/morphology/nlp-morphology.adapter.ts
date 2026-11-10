import { Injectable } from '@nestjs/common';
import { NlpService } from '../nlp/nlp.service';
import { PartOfSpeech } from '../../types/part-of-speech.enum';
import type {
  MorphologyProvider,
  LemmaCandidate,
  InflectionForm,
  InflectionResult,
} from './morphology-provider';

@Injectable()
export class NlpMorphologyAdapter implements MorphologyProvider {
  constructor(private readonly nlp: NlpService) {}
  findLemmaCandidates(
    surface: string,
    language: string,
  ): Promise<LemmaCandidate[]> {
    return this.nlp.findLemmaCandidates(surface, language);
  }
  getInflections(
    lemma: string,
    partOfSpeech: PartOfSpeech,
    language: string,
  ): Promise<InflectionForm[]> {
    return this.nlp.getInflections(lemma, partOfSpeech, language);
  }
  getInflectionsBatch(
    entries: LemmaCandidate[],
    language: string,
  ): Promise<InflectionResult[]> {
    return this.nlp.getInflectionsBatch(entries, language);
  }
}
