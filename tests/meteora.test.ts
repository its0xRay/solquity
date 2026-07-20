import { describe, expect, it } from "vitest";
import { normalizeMeteoraPool, type MeteoraPool } from "../lib/adapters/meteora";

const pool: MeteoraPool = {
  address: "pool",
  name: "TSLAx-USDC",
  token_x: { address: "mint", symbol: "TSLAx" },
  token_y: { address: "usdc", symbol: "USDC" },
  apy: 1.25,
  tvl: 50_000,
  volume: { "24h": 2_000 },
  pool_config: { base_fee_pct: 0.01, bin_step: 10 },
};

describe("Meteora exact-market normalization", () => {
  it("accepts an exact Tokens market and variant mint without changing reported values", () => {
    const result = normalizeMeteoraPool({ provider: "Meteora", marketId: "pool", mint: "mint", fetchedAt: 10, payload: pool }, "dlmm");
    expect(result?.marketId).toBe("pool");
    expect(result?.metrics.find((metric) => metric.key === "apy24h")?.value).toBe(1.25);
    expect(result?.metrics.find((metric) => metric.key === "baseFee")?.value).toBe(0.01);
    expect(result?.metrics.find((metric) => metric.key === "binStep")?.value).toBe(10);
  });

  it("rejects address mismatches, mint mismatches, and blacklisted pools", () => {
    expect(normalizeMeteoraPool({ provider: "Meteora", marketId: "other", mint: "mint", fetchedAt: 10, payload: pool }, "dlmm")).toBeNull();
    expect(normalizeMeteoraPool({ provider: "Meteora", marketId: "pool", mint: "other", fetchedAt: 10, payload: pool }, "dlmm")).toBeNull();
    expect(normalizeMeteoraPool({ provider: "Meteora", marketId: "pool", mint: "mint", fetchedAt: 10, payload: { ...pool, is_blacklisted: true } }, "dlmm")).toBeNull();
  });
});
