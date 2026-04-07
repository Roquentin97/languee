import { LemmatizerStub } from "./lemmatizer.stub";

describe("LemmatizerStub", () => {
  let stub: LemmatizerStub;

  beforeEach(() => {
    stub = new LemmatizerStub();
  });

  it("should return lemma equal to input.lemma (happy path)", () => {
    const result = stub.lemmatize({ lemma: "run", short_circuited: false });
    expect(result.lemma).toBe("run");
  });

  it("edge case 5: lemma must equal preLemmatized.lemma", () => {
    const input = { lemma: "quick brown fox", short_circuited: true };
    const result = stub.lemmatize(input);
    expect(result.lemma).toBe(input.lemma);
  });

  it("edge case 1: empty lemma — must not throw", () => {
    expect(() =>
      stub.lemmatize({ lemma: "", short_circuited: false }),
    ).not.toThrow();
  });

  it("edge case 2: multi-word lemma — must not throw", () => {
    expect(() =>
      stub.lemmatize({ lemma: "hello world", short_circuited: false }),
    ).not.toThrow();
  });
});
