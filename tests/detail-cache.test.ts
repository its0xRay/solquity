import { describe, expect, it } from "vitest";
import { COMPLETE_DETAIL_TTL_MS, isDetailCacheFresh, PARTIAL_DETAIL_TTL_MS } from "../lib/detail-cache";
import { sourceFailure } from "../lib/source-result";
import { AssetDetail } from "../lib/types";

function detail(partial: boolean): AssetDetail {
  return {
    asset: { assetId: "tesla", category: "equity" },
    variants: [],
    marketResultsByMint: partial ? { mint: sourceFailure(new Error("temporary"), 1) } : {},
    displayMarketsByMint: {},
    displayCapabilitiesByMint: {},
    riskResultsByMint: {},
    fetchedAt: 1,
  };
}

describe("partial-source browser retry", () => {
  it("expires partial data sooner than complete data", () => {
    const cachedAt = 1_000;
    expect(isDetailCacheFresh({ detail: detail(true), cachedAt }, cachedAt + PARTIAL_DETAIL_TTL_MS - 1)).toBe(true);
    expect(isDetailCacheFresh({ detail: detail(true), cachedAt }, cachedAt + PARTIAL_DETAIL_TTL_MS)).toBe(false);
    expect(isDetailCacheFresh({ detail: detail(false), cachedAt }, cachedAt + COMPLETE_DETAIL_TTL_MS - 1)).toBe(true);
  });
});
