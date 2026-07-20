import { describe, expect, it } from "vitest";
import { buildCapabilityCoverage, featuredAssets, preferredCapabilityMint, type CapabilityCoverageIndex } from "../lib/capability-coverage";
import type { Asset } from "../lib/types";

describe("capability coverage presentation", () => {
  it("orders actions in the user-facing sequence", () => {
    const coverage = buildCapabilityCoverage({
      assets: [{ assetId: "example", capabilities: ["borrow", "other", "trade", "liquidity", "earn"] }],
      variants: [{ assetId: "example", mint: "example-mint", capabilities: ["borrow", "other", "trade", "liquidity", "earn"] }],
    });
    expect(coverage.byMint["example-mint"]).toEqual([
      "trade", "earn", "borrow", "liquidity",
    ]);
  });

  it("keeps the Tokens primary version when it is tied for richest coverage", () => {
    const primaryMint = "primary-mint";
    const coverage = buildCapabilityCoverage({
      assets: [{ assetId: "spacex", capabilities: ["trade", "earn"] }],
      variants: [
        { assetId: "spacex", mint: primaryMint, capabilities: ["trade", "earn"] },
        { assetId: "spacex", mint: "other-mint", capabilities: ["trade", "earn"] },
      ],
    });
    const asset: Asset = {
      assetId: "spacex",
      name: "SpaceX",
      symbol: "SPCX",
      category: "equity",
      primaryVariant: { variantId: primaryMint, mint: primaryMint, kind: "tokenized_equity" },
    };
    expect(preferredCapabilityMint(asset, coverage)).toBe(primaryMint);
  });

  it("alternates three capability-led and three Tokens-liquidity-led assets across twelve slots", () => {
    const assets: Asset[] = [
      { assetId: "cap-four", name: "Cap Four", symbol: "C4", category: "equity", stats: { liquidity: 10 } },
      { assetId: "cap-three", name: "Cap Three", symbol: "C3", category: "equity", stats: { liquidity: 20 } },
      { assetId: "cap-two", name: "Cap Two", symbol: "C2", category: "etf", stats: { liquidity: 30 } },
      { assetId: "cap-next-four", name: "Cap Next Four", symbol: "CN4", category: "equity", stats: { liquidity: 9 } },
      { assetId: "cap-next-three", name: "Cap Next Three", symbol: "CN3", category: "equity", stats: { liquidity: 19 } },
      { assetId: "cap-next-two", name: "Cap Next Two", symbol: "CN2", category: "etf", stats: { liquidity: 29 } },
      { assetId: "liquid-one", name: "Liquid One", symbol: "L1", category: "equity", stats: { liquidity: 1_000 } },
      { assetId: "liquid-two", name: "Liquid Two", symbol: "L2", category: "etf", stats: { liquidity: 900 } },
      { assetId: "liquid-three", name: "Liquid Three", symbol: "L3", category: "equity", stats: { liquidity: 800 } },
      { assetId: "liquid-four", name: "Liquid Four", symbol: "L4", category: "equity", stats: { liquidity: 700 } },
      { assetId: "liquid-five", name: "Liquid Five", symbol: "L5", category: "etf", stats: { liquidity: 600 } },
      { assetId: "liquid-six", name: "Liquid Six", symbol: "L6", category: "equity", stats: { liquidity: 500 } },
      { assetId: "missing-liquidity", name: "Missing", symbol: "NA", category: "equity" },
    ];
    const coverage: CapabilityCoverageIndex = {
      byAsset: {},
      byMint: {
        "mint-four": ["trade", "earn", "borrow", "liquidity"],
        "mint-three": ["trade", "earn", "borrow"],
        "mint-two": ["trade", "liquidity"],
        "mint-next-four": ["trade", "earn", "borrow", "liquidity"],
        "mint-next-three": ["trade", "earn", "borrow"],
        "mint-next-two": ["trade", "liquidity"],
        "mint-liquid": ["trade"],
      },
      mintsByAsset: {
        "cap-four": ["mint-four"],
        "cap-three": ["mint-three"],
        "cap-two": ["mint-two"],
        "cap-next-four": ["mint-next-four"],
        "cap-next-three": ["mint-next-three"],
        "cap-next-two": ["mint-next-two"],
        "liquid-one": ["mint-liquid"],
      },
    };

    expect(featuredAssets(assets, coverage).map((asset) => asset.assetId)).toEqual([
      "cap-four", "cap-next-four", "cap-three",
      "liquid-one", "liquid-two", "liquid-three",
      "cap-next-three", "cap-two", "cap-next-two",
      "liquid-four", "liquid-five", "liquid-six",
    ]);
  });
});
