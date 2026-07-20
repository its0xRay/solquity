import { describe, expect, it } from "vitest";
import { normalizeRaydiumPool, raydiumAppUrl, type RaydiumPool } from "../lib/adapters/raydium";

const pool: RaydiumPool = {
  id: "pool",
  type: "Concentrated",
  programId: "program",
  mintA: { address: "mint", symbol: "STOCKx" },
  mintB: { address: "usdc", symbol: "USDC" },
  feeRate: 0.01,
  tvl: 100,
  day: { volume: 20, volumeFee: 0.2, apr: 3.5, feeApr: 3.5 },
  pooltype: ["RWA", "Clmm"],
  config: { tickSpacing: 120 },
};

describe("Raydium exact-market normalization", () => {
  it("keeps exact provider metrics and their raw paths", () => {
    const result = normalizeRaydiumPool({ provider: "Raydium", marketId: "pool", mint: "mint", fetchedAt: 10, payload: pool });
    expect(result?.metrics.find((metric) => metric.key === "tvl")).toMatchObject({ value: 100, rawPath: "tvl" });
    expect(result?.metrics.find((metric) => metric.key === "volume24h")).toMatchObject({ value: 20, rawPath: "day.volume" });
  });

  it("rejects pool or mint identity mismatches", () => {
    expect(normalizeRaydiumPool({ provider: "Raydium", marketId: "other", mint: "mint", fetchedAt: 10, payload: pool })).toBeNull();
    expect(normalizeRaydiumPool({ provider: "Raydium", marketId: "pool", mint: "other", fetchedAt: 10, payload: pool })).toBeNull();
  });

  it("links to the exact Raydium pool", () => {
    expect(raydiumAppUrl("pool")).toContain("pool_id=pool");
  });
});
