import { Injectable } from '@nestjs/common';
import {
  INormalizer,
  NormalizedOutput,
  RawInput,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class Normalizer implements INormalizer {
  normalize(input: RawInput): NormalizedOutput {
    const trimmed = input.raw.trim();
    const lowercased = trimmed.toLowerCase();
    const normalized = lowercased.normalize('NFC');
    return {
      normalized_form: normalized,
      is_multi_word: false,
      pos: null,
    };
  }
}
