import { describe, expect, it } from "vitest";
import { contentFor, issuerContent, redemptionLabel } from "../lib/issuer-content";
import type { Variant } from "../lib/types";

const variant = (issuer:string,kind="stock"):Variant => ({issuer,kind,mint:`mint-${issuer}`,variantId:issuer,symbol:"TSLA"});
describe("reviewed ownership content", () => {
  it("keeps share routes issuer-specific, never cross-converts TSLAx through Backpack", () => {
    const x = contentFor(variant("xStocks"))!;
    expect(redemptionLabel(variant("xStocks"))).toBe("Shares or cash");
    expect(x.routes.find(route => route.label === "To shares")?.steps).toContain("xPort · Alpaca");
    expect(x.routes.every(route => !route.url.includes("backpack"))).toBe(true);
    expect(contentFor(variant("Backpack"))?.routes[0].steps).toContain("Backpack Securities");
  });
  it("does not apply reviewed stock terms to unknown issuers or other product families", () => {
    expect(contentFor(variant("unknown"))).toBeUndefined();
    expect(contentFor(variant("Ondo","yield_token"))).toBeUndefined();
    expect(contentFor(variant("Ondo"))?.holding).toContain("total-return");
  });
  it("resolves an omitted issuer only from an officially listed mint, never its ticker", () => {
    expect(contentFor({...variant("unknown"),symbol:"TSLA",mint:"TSLAqBbv4CNCnzWFeB7LmydAyEiNMJtve7DYKLpdK4S"})?.id).toBe("backpack");
    expect(contentFor({...variant("unknown"),symbol:"TSLA",stockVariantTier:"share_redeemable"})).toBeUndefined();
  });
  it("provides real source links with no mockup placeholders or execution assurances", () => {
    for (const content of Object.values(issuerContent)) {
      expect(content.sources.length).toBeGreaterThan(0);
      for (const route of content.routes) {
        expect(content.sources.some(source => source.id === route.sourceId)).toBe(true);
        expect(route.url).toMatch(/^https:\/\//);
      }
      expect(JSON.stringify(content)).not.toContain("[custodian]");
      expect(JSON.stringify(content)).not.toContain("[fee]");
    }
  });
});
