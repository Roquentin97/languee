import { Injectable } from "@nestjs/common";
import {
  IGapFillService,
  GapFillInput,
  GapFilledOutput,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class GapFillStub implements IGapFillService {
  fill(input: GapFillInput): GapFilledOutput {
    return {
      definitions: input.definitions,
      hints: "stub-hint",
    };
  }
}
