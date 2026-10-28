import { beforeEach, describe, expect, it, vi } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/tokens-client", () => ({tokensFetch:fetchMock}));
import { getAssetOverview, getVariantMarkets, getVariantMints, getVariantRisk } from "../lib/tokens";

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (path:string) => {
    const source = path.split("/")[2].split("?")[0];
    const mint = source === "sp500" ? "mint-x" : "mint-on";
    if (path.includes("/variants?")) return {variants:[{variantId:`${source}:${mint}`,mint,kind:"etf",symbol:source === "sp500" ? "SPYx" : "SPYon"}]};
    if (path.includes("include=markets")) return {includes:{markets:{ok:true,data:{markets:[],total:0}}}};
    if (path.includes("risk-summary")) return {risk:{ok:true}};
    return {asset:{assetId:source,name:source,category:"etf",primaryVariant:{variantId:mint,mint,kind:"etf"}}};
  });
});
describe("grouped ETF data routes", () => {
  it("exposes both versions from either old asset ID", async () => {
    const detail = await getAssetOverview("spdr-sandp-500-etf");
    expect(detail.asset.assetId).toBe("sp500");
    expect(detail.asset.primaryVariant?.mint).toBe("mint-on");
    expect(detail.variants.map(item => item.mint)).toEqual(["mint-x","mint-on"]);
    expect(await getVariantMints("sp500")).toEqual(["mint-x","mint-on"]);
  });
  it("fetches a grouped variant’s markets and risk from its original source", async () => {
    await getVariantMarkets("sp500","mint-on");
    await getVariantRisk("sp500","mint-on");
    expect(fetchMock.mock.calls.some(([path]) => path.startsWith("/assets/spdr-sandp-500-etf?include=markets&mint=mint-on"))).toBe(true);
    expect(fetchMock.mock.calls.some(([path]) => path.startsWith("/assets/spdr-sandp-500-etf/risk-summary?mint=mint-on"))).toBe(true);
  });
});
