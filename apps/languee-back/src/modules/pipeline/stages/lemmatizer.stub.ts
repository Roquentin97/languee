import { Injectable } from "@nestjs/common";
import {
  ILemmatizer,
  LemmatizedOutput,
  PreLemmatizedOutput,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class LemmatizerStub implements ILemmatizer {
  lemmatize(input: PreLemmatizedOutput): LemmatizedOutput {
    return {
      lemma: input.lemma,
    };
  }
}
