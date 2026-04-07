import { Injectable } from "@nestjs/common";
import {
  IDuplicateChecker,
  DuplicateCheckInput,
  Definition,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class DuplicateCheckerStub implements IDuplicateChecker {
  check(_input: DuplicateCheckInput): Definition[] {
    return [];
  }
}
