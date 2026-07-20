import { describe, expect, it } from "vitest";
import { isProvenanceComplete, NormalizedEnrichmentRecord } from "../lib/enrichment";

describe("enrichment provenance", () => {
  const record: NormalizedEnrichmentRecord = {
    provider: "Fixture",
    marketId: "exact-market",
    mint: "exact-mint",
    capability: "earn",
    metrics: [{ key: "supplyApy", label: "Supply APY", value: 4.2, unit: "percent", rawPath: "reserve.supplyApy", reportedAt: 100 }],
    fetchedAt: 110,
  };

  it("requires exact provider, market, mint, fetch time, and raw metric paths", () => {
    expect(isProvenanceComplete(record)).toBe(true);
    expect(isProvenanceComplete({ ...record, marketId: "" })).toBe(false);
    expect(isProvenanceComplete({ ...record, metrics: [{ ...record.metrics[0], rawPath: "" }] })).toBe(false);
  });
});
