import { describe, expect, it } from "vitest";
import { detailWithMarketsResponseSchema, searchResponseSchema, variantsResponseSchema } from "../lib/tokens-schemas";

describe("Tokens response validation", () => {
  it("accepts multiple valid variants", () => {
    const result = variantsResponseSchema.safeParse({ variants: [
      { variantId: "tesla:xStock", mint: "X".repeat(44), kind: "stock", label: "xStock" },
      { variantId: "tesla:Ondo", mint: "O".repeat(44), kind: "stock", label: "Ondo" },
    ] });
    expect(result.success).toBe(true);
  });

  it("rejects a variant without a usable mint", () => {
    expect(variantsResponseSchema.safeParse({ variants: [{ variantId: "bad", mint: "short", kind: "stock" }] }).success).toBe(false);
  });

  it("requires consumed market metrics and venue source values to have safe types", () => {
    const valid = detailWithMarketsResponseSchema.safeParse({ asset: { assetId: "sandisk", category: "equity" }, includes: { markets: { ok: true, data: { markets: [{ address: "pool", source: "Byreal", volume24h: 12 }] } } } });
    const invalid = detailWithMarketsResponseSchema.safeParse({ asset: { assetId: "sandisk", category: "equity" }, includes: { markets: { ok: true, data: { markets: [{ address: "pool", source: "Byreal", volume24h: "12" }] } } } });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("validates official search results", () => {
    expect(searchResponseSchema.safeParse({ query: "tesla", category: "equity", results: [{ assetId: "tesla", category: "equity" }] }).success).toBe(true);
  });
});
