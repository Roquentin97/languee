import { Injectable } from '@nestjs/common';
import {
  ILemmatizer,
  PreLemmatizedOutput,
  LemmatizedOutput,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class LemmatizerStub implements ILemmatizer {
  lemmatize(input: PreLemmatizedOutput): LemmatizedOutput {
    return {
      lemma: input.lemma,
    };
  }
}
