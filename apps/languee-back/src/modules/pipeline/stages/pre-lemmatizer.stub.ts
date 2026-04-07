import { Injectable } from "@nestjs/common";
import {
  IPreLemmatizer,
  NormalizedOutput,
  PreLemmatizedOutput,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class PreLemmatizerStub implements IPreLemmatizer {
  preLemmatize(input: NormalizedOutput): PreLemmatizedOutput {
    return {
      lemma: input.normalized_form,
      short_circuited: false,
    };
  }
}
