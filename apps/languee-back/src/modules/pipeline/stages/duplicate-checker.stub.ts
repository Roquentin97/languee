import { Injectable } from '@nestjs/common';
import {
  IDuplicateChecker,
  LemmatizedOutput,
  Definition,
} from '../interfaces/pipeline.interfaces';

@Injectable()
export class DuplicateCheckerStub implements IDuplicateChecker {
  check(_input: LemmatizedOutput): Definition[] {
    return [];
  }
}
