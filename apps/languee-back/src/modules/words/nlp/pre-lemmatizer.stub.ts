import { Injectable } from '@nestjs/common';
import {
  IPreLemmatizer,
  NormalizedOutput,
  PreLemmatizedOutput,
} from '../interfaces/nlp.interfaces';

@Injectable()
export class PreLemmatizerStub implements IPreLemmatizer {
  preLemmatize(input: NormalizedOutput): PreLemmatizedOutput {
    return {
      lemma: input.normalizedForm,
      shortCircuited: false,
    };
  }
}
