import { NormalizerStub } from "./normalizer.stub";

describe("NormalizerStub", () => {
  let stub: NormalizerStub;

  beforeEach(() => {
    stub = new NormalizerStub();
  });

  it("should return normalized_form equal to raw (happy path)", () => {
    const result = stub.normalize({ raw: "hello" });
    expect(result.normalized_form).toBe("hello");
    expect(result.is_multi_word).toBe(false);
    expect(result.pos).toBeNull();
  });

  it("edge case 1: empty string — must not throw and return a NormalizedOutput", () => {
    expect(() => stub.normalize({ raw: "" })).not.toThrow();
    const result = stub.normalize({ raw: "" });
    expect(result).toHaveProperty("normalized_form");
    expect(result).toHaveProperty("is_multi_word");
    expect(result).toHaveProperty("pos");
  });

  it("edge case 2: multi-word string with spaces — must not throw", () => {
    expect(() => stub.normalize({ raw: "hello world foo" })).not.toThrow();
  });

  it("edge case 3: normalized_form must equal the full raw string", () => {
    const raw = "run quickly";
    const result = stub.normalize({ raw });
    expect(result.normalized_form).toBe(raw);
  });
});
