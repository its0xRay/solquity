import { describe, expect, it } from "vitest";
import { reconcileVariants } from "../lib/reconciliation";

describe("daily variant reconciliation", () => {
  it("adds new mints and resets existing observations", () => {
    expect(reconcileVariants([{ mint: "a", misses: 1, lastSeenAt: 1 }], ["a", "b"], 10)).toEqual([
      { mint: "a", misses: 0, lastSeenAt: 10 },
      { mint: "b", misses: 0, lastSeenAt: 10 },
    ]);
  });

  it("requires consecutive misses before removal", () => {
    const firstMiss = reconcileVariants([{ mint: "a", misses: 0, lastSeenAt: 1 }], [], 10);
    expect(firstMiss).toEqual([{ mint: "a", misses: 1, lastSeenAt: 1 }]);
    expect(reconcileVariants(firstMiss, [], 20)).toEqual([]);
  });
});
