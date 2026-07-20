import { describe, expect, it } from "vitest";
import { aggregateDisplayCapabilities, tokensMarketCapabilities, visibleCapabilities } from "../lib/capabilities";
import { sourceFailure, sourceSuccess } from "../lib/source-result";
import { capability, markets } from "./fixtures/tokens";

describe("Tokens capability normalization", () => {
  it("creates one record per exact market without cross-market calculations", () => {
    const records = tokensMarketCapabilities("tesla", "mint", markets, 100);
    expect(records.map((record) => record.kind)).toEqual(["trade", "trade"]);
    expect(records.map((record) => record.marketId)).toEqual(["market-a", "market-b"]);
    expect(records.map((record) => record.provider)).toEqual(["raydium", "orca"]);
    expect(records.map((record) => record.metrics.find((metric) => metric.key === "volume24h")?.value)).toEqual([1200, 800]);
    expect(records.flatMap((record) => record.metrics).some((metric) => metric.key.startsWith("total") || metric.label.toLowerCase().includes("total"))).toBe(false);
  });

  it("does not invent capabilities when no market is returned", () => {
    expect(tokensMarketCapabilities("tesla", "mint", [], 100)).toEqual([]);
  });
});

describe("visibility rules", () => {
  it("shows only verified active or explicitly stale capabilities", () => {
    expect(visibleCapabilities([capability("active"), capability("stale"), capability("unsupported"), capability("failed")]).map((item) => item.evidence.status)).toEqual(["active", "stale"]);
  });

  it("keeps successful emptiness distinct from provider failure", () => {
    const empty = aggregateDisplayCapabilities({ knownMints: ["mint"], batches: [{ provider: "Empty", result: sourceSuccess([]) }], now: 10 });
    const failed = aggregateDisplayCapabilities({ knownMints: ["mint"], batches: [{ provider: "Failed", result: sourceFailure(new Error("offline")) }], now: 10 });
    expect(empty).toEqual({ capabilities: [], rejected: [] });
    expect(failed.rejected).toEqual([{ provider: "Failed", reason: "source_failed" }]);
  });

  it("rejects unknown mints and hidden evidence states", () => {
    const unknown = { ...capability("active"), mint: "not-known" };
    const result = aggregateDisplayCapabilities({
      knownMints: ["mint"], batches: [{ provider: "Fixture", result: sourceSuccess([unknown, capability("unsupported"), capability("failed")]) }], now: 1,
    });
    expect(result.capabilities).toEqual([]);
    expect(result.rejected.map((item) => item.reason)).toEqual(["unknown_mint", "hidden_status", "hidden_status"]);
  });

  it("marks old active evidence stale while preserving a healthy provider", () => {
    const healthy = { ...capability("active"), id: "healthy", provider: "Healthy", evidence: { ...capability("active").evidence, observedAt: 100 } };
    const result = aggregateDisplayCapabilities({
      knownMints: ["mint"],
      batches: [
        { provider: "Broken", result: sourceFailure(new Error("timeout")) },
        { provider: "Healthy", result: sourceSuccess([healthy]) },
      ],
      now: 1_000,
      staleAfterMs: 500,
    });
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0].evidence.status).toBe("stale");
  });
});
