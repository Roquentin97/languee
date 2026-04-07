import { GapFillStub } from "./gap-fill.stub";
import { Definition } from "../interfaces/pipeline.interfaces";

describe("GapFillStub", () => {
  let stub: GapFillStub;

  beforeEach(() => {
    stub = new GapFillStub();
  });

  const sampleDefs: Definition[] = [
    {
      term: "run",
      definition: "To move fast.",
      examples: ["She runs every day."],
      part_of_speech: "verb",
      provider: "stub",
    },
  ];

  it("should return definitions untouched and hints as stub-hint (happy path)", () => {
    const result = stub.fill({ definitions: sampleDefs, hints_context: "run" });
    expect(result.definitions).toBe(sampleDefs);
    expect(result.hints).toBe("stub-hint");
  });

  it("edge case 8: definitions must be returned untouched (same reference)", () => {
    const result = stub.fill({ definitions: sampleDefs, hints_context: "run" });
    expect(result.definitions).toBe(sampleDefs);
  });

  it("edge case 8: hints must be stub-hint", () => {
    const result = stub.fill({ definitions: sampleDefs, hints_context: "run" });
    expect(result.hints).toBe("stub-hint");
  });

  it("edge case 1: empty definitions array — must not throw", () => {
    expect(() =>
      stub.fill({ definitions: [], hints_context: "" }),
    ).not.toThrow();
  });

  it("empty definitions array — returns empty definitions and stub-hint", () => {
    const result = stub.fill({ definitions: [], hints_context: "" });
    expect(result.definitions).toEqual([]);
    expect(result.hints).toBe("stub-hint");
  });
});
