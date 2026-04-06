import { Injectable } from '@nestjs/common';
import {
  IGapFillService,
  Definition,
  GapFilledOutput,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class GapFillStub implements IGapFillService {
  fill(definitions: Definition[]): GapFilledOutput {
    return {
      definitions,
      gap_fill_metadata: {},
    };
  }
}
