import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("best-effort request limits", () => {
  it("rejects requests above the per-window limit and resets later", () => {
    const key = `test:${Math.random()}`;
    expect(checkRateLimit(key, 2, 1_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 1_001).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 1_002).allowed).toBe(false);
    expect(checkRateLimit(key, 2, 61_000).allowed).toBe(true);
  });
});
