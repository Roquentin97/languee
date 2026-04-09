import { Injectable } from "@nestjs/common";
import {
  CardAssemblerInput,
  CardOutput,
  ICardAssembler,
} from "../interfaces/pipeline.interfaces";

@Injectable()
export class CardAssemblerStub implements ICardAssembler {
  assemble(input: CardAssemblerInput): CardOutput {
    return {
      id: "stub-card-id",
      deck_id: input.deck_id,
      user_id: input.user_id,
      definition_id: input.definition_id,
      front: "stub-front",
      back: "stub-back",
      hints: input.hints,
      nuance: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };
  }
}
