import { DuplicateCheckerStub } from "./duplicate-checker.stub";

describe("DuplicateCheckerStub", () => {
  let stub: DuplicateCheckerStub;

  beforeEach(() => {
    stub = new DuplicateCheckerStub();
  });

  it("should always return an empty array (happy path)", () => {
    const result = stub.check({ lemma: "run", deck_id: "deck-1" });
    expect(result).toEqual([]);
  });

  it("edge case 6: must always return an empty array regardless of input", () => {
    expect(stub.check({ lemma: "", deck_id: "deck-1" })).toEqual([]);
    expect(stub.check({ lemma: "hello world", deck_id: "deck-2" })).toEqual([]);
    expect(stub.check({ lemma: "anything", deck_id: "deck-3" })).toEqual([]);
  });

  it("edge case 1: empty string lemma — must not throw", () => {
    expect(() => stub.check({ lemma: "", deck_id: "deck-1" })).not.toThrow();
  });

  it("edge case 2: multi-word lemma — must not throw", () => {
    expect(() =>
      stub.check({ lemma: "hello world", deck_id: "deck-1" }),
    ).not.toThrow();
  });
});
