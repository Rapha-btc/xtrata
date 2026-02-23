import { describe, expect, it } from "vitest";
import {
  fromDependencyStrings,
  mergeDependencySources,
  normalizeDependencyIds,
  parseDependencyInput,
  toDependencyStrings,
  validateDependencyIds,
} from "../dependencies";

describe("mint dependency helpers", () => {
  it("parses ids from comma/space/newline input", () => {
    const result = parseDependencyInput("1, 2 3\n4");
    expect(result.invalidTokens).toEqual([]);
    expect(result.ids).toEqual([1n, 2n, 3n, 4n]);
  });

  it("rejects invalid tokens and negatives", () => {
    const result = parseDependencyInput("1, -2 foo 3.5");
    expect(result.ids).toEqual([1n]);
    expect(result.invalidTokens).toEqual(["-2", "foo", "3.5"]);
  });

  it("dedupes repeated ids", () => {
    const normalized = normalizeDependencyIds([2n, 1n, 2n, 3n, 1n]);
    expect(normalized).toEqual([1n, 2n, 3n]);
  });

  it("preserves deterministic output order", () => {
    const normalized = normalizeDependencyIds([10n, 2n, 5n]);
    expect(normalized).toEqual([2n, 5n, 10n]);
  });

  it("enforces max 50 dependencies", () => {
    const ids = Array.from({ length: 51 }, (_, idx) => BigInt(idx));
    const validation = validateDependencyIds(ids);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe("max-50");
  });

  it("merges manual and delegate sources correctly", () => {
    const merged = mergeDependencySources([1n, 2n], [2n, 3n]);
    expect(merged).toEqual([1n, 2n, 3n]);
  });

  it("serializes/deserializes string form safely", () => {
    const original = [3n, 1n, 2n];
    const serialized = toDependencyStrings(original);
    expect(serialized).toEqual(["3", "1", "2"]);
    const restored = fromDependencyStrings(serialized);
    expect(restored).toEqual([1n, 2n, 3n]);
  });
});
