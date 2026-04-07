import { Injectable } from "@nestjs/common";
import {
  ICardAssembler,
  CardAssemblerInput,
  CardOutput,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class CardAssemblerStub implements ICardAssembler {
  assemble(input: CardAssemblerInput): CardOutput {
    return {
      id: "stub-card-id",
      definition_id: input.definition_id,
      deck_id: input.deck_id,
      user_id: input.user_id,
      term: "stub-term",
      lemma: "stub-lemma",
      definition: "A stub definition for testing.",
      examples: ["Stub example sentence."],
      part_of_speech: "noun",
      hints: input.hints,
      nuance: null,
      created_at: new Date("2024-01-01T00:00:00.000Z"),
      updated_at: new Date("2024-01-01T00:00:00.000Z"),
    };
  }
}
