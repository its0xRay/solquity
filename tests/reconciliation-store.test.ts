import { describe, expect, it } from "vitest";
import { MemoryReconciliationStore } from "../lib/reconciliation-store";

describe("reconciliation persistence boundary", () => {
  it("can be replaced by deployment storage without changing reconciliation", async () => {
    const store = new MemoryReconciliationStore();
    expect(await store.load()).toBeNull();
    await store.save({ observedAt: 10, variants: [{ mint: "mint", misses: 0, lastSeenAt: 10 }] });
    expect(await store.load()).toEqual({ observedAt: 10, variants: [{ mint: "mint", misses: 0, lastSeenAt: 10 }] });
  });
});
