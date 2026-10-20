import { describe, expect, it } from "vitest";
import { fetchKaminoSnapshot, normalizeKaminoMatches } from "../lib/adapters/kamino";

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

describe("Kamino scan deadline", () => {
  it("limits concurrent reserve requests and preserves catalog order", async () => {
    const markets = Array.from({ length: 24 }, (_, index) => ({ ...market, lendingMarket: String(index) }));
    let active = 0;
    let peak = 0;
    const snapshot = await fetchKaminoSnapshot(async (url) => {
      if (String(url).endsWith("/v2/kamino-market")) return Response.json(markets);
      const id = String(url).split("/kamino-market/")[1].split("/")[0];
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, Number(id) % 3));
      active--;
      return Response.json([{ ...reserve, reserve: id }]);
    });
    expect(peak).toBeLessThanOrEqual(8);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.matchesByMint.get("mint")?.map((match) => match.market.lendingMarket)).toEqual(markets.map((item) => item.lendingMarket));
  });

  it("keeps exact-mint results when another market hangs, within the total budget", async () => {
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/v2/kamino-market")) {
        return Response.json([market, { ...market, lendingMarket: "slow" }]);
      }
      if (String(url).includes("/slow/")) {
        return new Promise((_, reject) => {
          const signal = init!.signal!;
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      return Response.json([reserve]);
    };
    const snapshot = await fetchKaminoSnapshot(fetcher, 50);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.failedMarkets).toBe(1);
    expect(snapshot.matchesByMint.get("mint")).toEqual([{ market, reserve }]);
  });

  it("marks a fully checked scan complete, including an empty market", async () => {
    const snapshot = await fetchKaminoSnapshot(async (url) => Response.json(
      String(url).endsWith("/v2/kamino-market") ? [market] : [],
    ));
    expect(snapshot.complete).toBe(true);
    expect(snapshot.failedMarkets).toBe(0);
    expect(snapshot.matchesByMint.size).toBe(0);
  });

  it("does not turn a failed reserve scan into an empty success", async () => {
    await expect(fetchKaminoSnapshot(async (url) => Response.json(
      String(url).endsWith("/v2/kamino-market") ? [market] : { error: "unavailable" },
    ))).rejects.toThrow("Kamino reserve metrics unavailable");
  });
});
