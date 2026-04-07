import { DefinitionProviderStub } from "./definition-provider.stub";

describe("DefinitionProviderStub", () => {
  let stub: DefinitionProviderStub;

  beforeEach(() => {
    stub = new DefinitionProviderStub();
  });

  it("should return exactly one definition (happy path)", () => {
    const result = stub.provide({ lemma: "run", language: "en" });
    expect(result).toHaveLength(1);
  });

  it("edge case 7: must always return an array with exactly one entry", () => {
    expect(stub.provide({ lemma: "", language: "en" })).toHaveLength(1);
    expect(stub.provide({ lemma: "hello world", language: "en" })).toHaveLength(
      1,
    );
    expect(stub.provide({ lemma: "anything", language: "fr" })).toHaveLength(1);
  });

  it("definition entry must have term, definition, examples, part_of_speech, and provider fields", () => {
    const result = stub.provide({ lemma: "test", language: "en" });
    expect(result[0]).toHaveProperty("term");
    expect(result[0]).toHaveProperty("definition");
    expect(result[0]).toHaveProperty("examples");
    expect(result[0]).toHaveProperty("part_of_speech");
    expect(result[0]).toHaveProperty("provider");
  });

  it("edge case 1: empty string lemma — must not throw", () => {
    expect(() => stub.provide({ lemma: "", language: "en" })).not.toThrow();
  });

  it("edge case 2: multi-word lemma — must not throw", () => {
    expect(() =>
      stub.provide({ lemma: "hello world", language: "en" }),
    ).not.toThrow();
  });
});
