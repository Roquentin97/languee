import { Injectable } from "@nestjs/common";
import {
  Definition,
  DuplicateCheckInput,
  IDuplicateChecker,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class DuplicateCheckerStub implements IDuplicateChecker {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(_input: DuplicateCheckInput): Definition[] {
    return [];
  }
}
