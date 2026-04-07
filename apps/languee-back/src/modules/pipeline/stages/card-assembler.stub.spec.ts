import { CardAssemblerStub } from "./card-assembler.stub";

describe("CardAssemblerStub", () => {
  let stub: CardAssemblerStub;

  beforeEach(() => {
    stub = new CardAssemblerStub();
  });

  const input = {
    deck_id: "deck-1",
    user_id: "user-1",
    definition_id: "def-1",
    hints: "some-hint",
  };

  it("should return a CardOutput with all fields (happy path)", () => {
    const result = stub.assemble(input);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("definition_id");
    expect(result).toHaveProperty("deck_id");
    expect(result).toHaveProperty("user_id");
    expect(result).toHaveProperty("term");
    expect(result).toHaveProperty("lemma");
    expect(result).toHaveProperty("definition");
    expect(result).toHaveProperty("examples");
    expect(result).toHaveProperty("part_of_speech");
    expect(result).toHaveProperty("hints");
    expect(result).toHaveProperty("nuance");
    expect(result).toHaveProperty("created_at");
    expect(result).toHaveProperty("updated_at");
  });

  it("edge case 9: assemble must return all CardOutput fields", () => {
    const result = stub.assemble(input);
    const keys: Array<keyof typeof result> = [
      "id",
      "definition_id",
      "deck_id",
      "user_id",
      "term",
      "lemma",
      "definition",
      "examples",
      "part_of_speech",
      "hints",
      "nuance",
      "created_at",
      "updated_at",
    ];
    keys.forEach((key) => expect(result).toHaveProperty(key));
  });

  it("should reflect input fields in output", () => {
    const result = stub.assemble(input);
    expect(result.deck_id).toBe(input.deck_id);
    expect(result.user_id).toBe(input.user_id);
    expect(result.definition_id).toBe(input.definition_id);
    expect(result.hints).toBe(input.hints);
  });

  it("edge case 1: nuance must be null", () => {
    const result = stub.assemble(input);
    expect(result.nuance).toBeNull();
  });

  it("edge case 2: created_at and updated_at must be Date instances", () => {
    const result = stub.assemble(input);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });
});
