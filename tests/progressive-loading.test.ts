import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/tokens-client", () => ({tokensFetch:vi.fn()}));
import { tokensFetch } from "../lib/tokens-client";
import { getAssetOverview, getAssetDetail, getVariantMarkets } from "../lib/tokens";
const fetcher = vi.mocked(tokensFetch);
beforeEach(() => {
  fetcher.mockReset();
  fetcher.mockImplementation(async (url) => {
    if (url.includes("/variants?")) return {variants:[{mint:"one",variantId:"one",kind:"stock"},{mint:"two",variantId:"two",kind:"stock"}]} as never;
    if (url.includes("include=markets")) return {includes:{markets:{ok:true,data:{markets:[],total:0}}}} as never;
    if (url.includes("risk-summary")) return {risk:{}} as never;
    return {asset:{assetId:"tesla",name:"Tesla",category:"equity"}} as never;
  });
});
describe("selected-version-first loading", () => {
  it("coalesces simultaneous market requests and reuses their original timestamp", async () => {
    const [first, second] = await Promise.all([getVariantMarkets("dedupe-test","mint"),getVariantMarkets("dedupe-test","mint")]);
    const third = await getVariantMarkets("dedupe-test","mint");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(third.fetchedAt).toBe(first.fetchedAt);
  });
  it("renders metadata without fetching markets, risk, or the stock universe", async () => {
    const result = await getAssetOverview("tesla");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.variants).toHaveLength(2);
    expect(fetcher.mock.calls.every(([url]) => !/risk|markets|curated/.test(url))).toBe(true);
  });
  it("fetches only the selected mint and no risk in the fast market path", async () => {
    const result = await getAssetDetail("tesla",{mint:"two",includeRisk:false});
    expect(result.variants).toHaveLength(2);
    expect(Object.keys(result.marketResultsByMint)).toEqual(["two"]);
    expect(result.riskResultsByMint).toEqual({});
    expect(fetcher.mock.calls.filter(([url]) => url.includes("include=markets"))).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => url.includes("risk-summary"))).toBe(false);
  });
  it("preserves full loading for existing audit callers", async () => {
    const result = await getAssetDetail("tesla");
    expect(Object.keys(result.marketResultsByMint)).toEqual(["one","two"]);
    expect(Object.keys(result.riskResultsByMint)).toEqual(["one","two"]);
  });
});
