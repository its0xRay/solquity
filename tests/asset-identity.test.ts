import { describe, expect, it } from "vitest";
import { assetMembers, canonicalAssetId, groupAssets, normalizeVariant } from "../lib/asset-identity";
import { contentFor, identitySource, providerName } from "../lib/issuer-content";
import { resolveVersion, stockPath } from "../lib/asset-url";
import type { Asset, Variant } from "../lib/types";

const variant = (mint:string,symbol="NVDA"):Variant => ({variantId:mint,mint,kind:"stock",symbol,label:symbol});
describe("verified security identity", () => {
  it("identifies Backpack NVIDIA by its published mint, not its symbol", () => {
    const nvda = normalizeVariant(variant("NVDAVuiB7hwd3m5Wa1JuHNovPaPG6BH1QNztbKFxNjv"));
    expect(providerName(nvda)).toBe("Backpack");
    expect(contentFor(nvda)?.id).toBe("backpack");
    expect(identitySource(nvda)).toContain("/tokenized-stocks/assets");
    expect(providerName(variant("unverified-token"))).toBe("Provider not verified");
    expect(contentFor(variant("unverified-token"))).toBeUndefined();
  });
  it("recognizes the officially published SPYx and QQQx mint addresses", () => {
    for (const mint of ["XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W","Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ"]) {
      expect(providerName(variant(mint))).toBe("xStocks");
      expect(contentFor({...variant(mint),kind:"etf"})).toBeDefined();
      expect(identitySource(variant(mint))).toContain("assets.backed.fi/products/");
    }
  });
  it("groups only reviewed aliases and retains exact source routes", () => {
    const assets:Asset[] = [
      {assetId:"sp500",symbol:"SPY",category:"equity",primaryVariant:variant("x","SPYx")},
      {assetId:"spdr-sandp-500-etf",symbol:"SPY",category:"etf",primaryVariant:variant("on","SPYon")},
      {assetId:"other-spy",symbol:"SPY",category:"equity",primaryVariant:variant("other")},
    ];
    const grouped = groupAssets(assets);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].category).toBe("etf");
    expect(grouped[0].variants?.map(item => item.sourceAssetId)).toEqual(["sp500","spdr-sandp-500-etf"]);
    expect(assetMembers("invesco-qqq")).toEqual(["nasdaq","invesco-qqq"]);
    expect(canonicalAssetId("proshares-ultrapro-short-qqq")).toBe("proshares-ultrapro-short-qqq");
    expect(stockPath("proshares-ultrapro-qqq")).toBe("/stocks/tqqq");
  });
  it("preserves the old unnamed-provider URL after identifying Backpack", () => {
    const nvda = normalizeVariant(variant("NVDAVuiB7hwd3m5Wa1JuHNovPaPG6BH1QNztbKFxNjv"));
    expect(resolveVersion([nvda],{version:"nvda"})).toBe(nvda);
    expect(resolveVersion([nvda],{version:"backpack"})).toBe(nvda);
  });
  it("identifies both sides of the grouped ETF comparison from exact mints", () => {
    expect(providerName(variant("k18WJUULWheRkSpSquYGdNNmtuE2Vbw1hpuUi92ondo","SPYon"))).toBe("Ondo");
    expect(providerName(variant("14W1itEkV7k1W819mLSknFTaMmkCtPokbF2tRkPUondo","TQQQon"))).toBe("Ondo");
    expect(providerName(variant("XsjQP3iMAaQ3kQScQKthQpx9ALRbjKAjQtHg6TFomoc","TQQQx"))).toBe("xStocks");
  });
  it("does not merge share classes or leveraged and inverse funds by ticker", () => {
    const ids = ["alphabet-a","alphabet-c","nasdaq","tqqq","proshares-ultrapro-short-qqq"];
    expect(groupAssets(ids.map(assetId => ({assetId,symbol:"QQQ",category:"equity"})))).toHaveLength(5);
  });
});
