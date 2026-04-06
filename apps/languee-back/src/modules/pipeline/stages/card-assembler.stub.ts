import { Injectable } from '@nestjs/common';
import {
  ICardAssembler,
  NormalizedOutput,
  LemmatizedOutput,
  GapFilledOutput,
  CardOutput,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class CardAssemblerStub implements ICardAssembler {
  assemble(
    _input: NormalizedOutput & LemmatizedOutput & GapFilledOutput,
  ): CardOutput {
    return {
      id: 'stub-card-id',
      term: 'stub-term',
      lemma: 'stub-lemma',
      definition: 'A stub definition for testing.',
      examples: ['Stub example sentence.'],
      pos: null,
      is_multi_word: false,
      gap_fill_metadata: {},
    };
  }
}
