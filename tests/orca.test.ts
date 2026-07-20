import { describe, expect, it } from "vitest";
import { normalizeOrcaPool, orcaAppUrl, orcaPoolResponseSchema, orcaPoolUrl, type OrcaPool } from "../lib/adapters/orca";

const pool: OrcaPool = {
  address: "pool",
  tokenMintA: "mint",
  tokenMintB: "usdc",
  tokenA: { address: "mint", symbol: "STOCKx" },
  tokenB: { address: "usdc", symbol: "USDC" },
  poolType: "whirlpool",
  tickSpacing: 64,
  feeRate: 2000,
  tvlUsdc: "100.50",
  hasWarning: false,
  stats: { "24h": { volume: "20.25", fees: "0.10", rewards: null, yieldOverTvl: null } },
  updatedAt: "2026-07-12T00:00:00Z",
  updatedSlot: 1,
};

describe("Orca exact-market normalization", () => {
  it("keeps exact provider metrics and raw paths", () => {
    const result = normalizeOrcaPool({ provider: "Orca", marketId: "pool", mint: "mint", fetchedAt: 10, payload: pool });
    expect(result?.metrics.find((metric) => metric.key === "tvl")).toMatchObject({ value: 100.5, rawPath: "tvlUsdc" });
    expect(result?.metrics.find((metric) => metric.key === "volume24h")).toMatchObject({ value: 20.25, rawPath: "stats.24h.volume" });
    expect(result?.metrics.find((metric) => metric.key === "hasWarning")).toMatchObject({ value: "false", rawPath: "hasWarning" });
  });

  it("rejects pool or mint identity mismatches", () => {
    expect(normalizeOrcaPool({ provider: "Orca", marketId: "other", mint: "mint", fetchedAt: 10, payload: pool })).toBeNull();
    expect(normalizeOrcaPool({ provider: "Orca", marketId: "pool", mint: "other", fetchedAt: 10, payload: pool })).toBeNull();
  });

  it("links to the exact Orca pool", () => {
    expect(orcaAppUrl("pool")).toBe("https://www.orca.so/pools/pool");
    expect(orcaPoolUrl("pool/address")).toBe("https://api.orca.so/v2/solana/pools/pool%2Faddress?stats=24h");
  });

  it("accepts the official exact-pool response wrapper", () => {
    expect(orcaPoolResponseSchema.parse({ data: pool, meta: { next: null, previous: null } }).data.address).toBe("pool");
  });
});
