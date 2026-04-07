import { Injectable } from "@nestjs/common";
import {
  IDefinitionProvider,
  DefinitionProviderInput,
  Definition,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class DefinitionProviderStub implements IDefinitionProvider {
  provide(_input: DefinitionProviderInput): Definition[] {
    return [
      {
        term: "stub-term",
        definition: "A stub definition for testing.",
        examples: ["Stub example sentence."],
        part_of_speech: "noun",
        provider: "stub",
      },
    ];
  }
}
