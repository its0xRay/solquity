import { describe, expect, it } from "vitest";
import { normalizeKaminoMatches } from "../lib/adapters/kamino";

const market = { name: "xStocks Market", lendingMarket: "market", isPrimary: false, description: "xStocks", isCurated: true };
const reserve = {
  reserve: "reserve", liquidityToken: "TSLAx", liquidityTokenMint: "mint", maxLtv: "0.55",
  borrowApy: "0.037", supplyApy: "0.0002", totalSupply: "100", totalBorrow: "2",
  totalBorrowUsd: "800", totalSupplyUsd: "40000",
};

describe("Kamino exact-mint capabilities", () => {
  it("creates earn and collateral capabilities without changing provider ratios", () => {
    const records = normalizeKaminoMatches({ assetId: "tesla", mint: "mint", now: 20 }, [{ market, reserve }], 10);
    expect(records.map((record) => record.kind)).toEqual(["earn", "borrow"]);
    expect(records[0].metrics.find((metric) => metric.key === "supplyApy")?.value).toBe(0.0002);
    expect(records[1].metrics.find((metric) => metric.key === "maxLtv")?.value).toBe(0.55);
    expect(records[1].metrics.find((metric) => metric.key === "borrowApy")).toBeUndefined();
    expect(records.every((record) => record.evidence.appUrl === "https://kamino.com/borrow?search=TSLAx")).toBe(true);
    expect(records.every((record) => record.marketId === "market" && record.evidence.source === "Kamino")).toBe(true);
  });

  it("rejects a reserve whose liquidity mint does not exactly match", () => {
    expect(normalizeKaminoMatches({ assetId: "tesla", mint: "other", now: 20 }, [{ market, reserve }], 10)).toEqual([]);
  });

  it("does not claim collateral use when Kamino reports zero max LTV", () => {
    const records = normalizeKaminoMatches({ assetId: "meta", mint: "mint", now: 20 }, [{ market, reserve: { ...reserve, maxLtv: "0" } }], 10);
    expect(records.map((record) => record.kind)).toEqual(["earn"]);
  });

  it("does not render an impossible max LTV as collateral support", () => {
    const records = normalizeKaminoMatches({ assetId: "meta", mint: "mint", now: 20 }, [{ market, reserve: { ...reserve, maxLtv: "55" } }], 10);
    expect(records.map((record) => record.kind)).toEqual(["earn"]);
    expect(records.flatMap((record) => record.metrics).some((metric) => metric.key === "maxLtv")).toBe(false);
  });

  it("falls back to the Kamino borrow page when the reserve symbol is empty", () => {
    const records = normalizeKaminoMatches({ assetId: "tesla", mint: "mint", now: 20 }, [{ market, reserve: { ...reserve, liquidityToken: "" } }], 10);
    expect(records.every((record) => record.evidence.appUrl === "https://kamino.com/borrow")).toBe(true);
  });
});
