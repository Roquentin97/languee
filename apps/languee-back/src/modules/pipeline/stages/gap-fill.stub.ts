import { Injectable } from "@nestjs/common";
import {
  GapFillInput,
  GapFilledOutput,
  IGapFillService,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class GapFillStub implements IGapFillService {
  fill(input: GapFillInput): GapFilledOutput {
    return {
      definitions: input.definitions,
      hints: "stub-hint",
      gap_fill_metadata: {},
    };
  }
}
