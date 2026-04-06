import { Injectable } from '@nestjs/common';
import {
  INormalizer,
  RawInput,
  NormalizedOutput,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class NormalizerStub implements INormalizer {
  normalize(input: RawInput): NormalizedOutput {
    return {
      normalized_form: input.raw,
      is_multi_word: false,
      pos: null,
    };
  }
}
