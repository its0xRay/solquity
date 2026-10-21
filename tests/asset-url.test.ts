import { describe, expect, it } from "vitest";
import { assetUrl, resolveVersion, versionSlug } from "../lib/asset-url";
import { parseScenario } from "../lib/scenario";
import type { Variant } from "../lib/types";
const x: Variant = {variantId:"x",mint:"mint-x",symbol:"TSLAx",issuer:"xStocks",kind:"stock"};
const ondo: Variant = {variantId:"on",mint:"mint-on",symbol:"TSLAon",issuer:"Ondo",kind:"stock"};
const variants = [x,ondo];
const base = {assetId:"tesla",variant:x,variants,defaultMint:x.mint,scenario:parseScenario({})};
describe("clean, backwards-compatible asset links", () => {
  it("keeps default Tesla at root without query strings", () => expect(assetUrl({...base,home:true})).toBe("/"));
  it("uses a readable stock route for explicit asset pages", () => expect(assetUrl({...base,assetId:"nvidia"})).toBe("/stocks/nvidia"));
  it("uses a friendly version instead of a mint", () => {
    expect(assetUrl({...base,variant:ondo})).toBe("/stocks/tesla?version=ondo");
    expect(resolveVersion(variants,{version:"ondo"})).toBe(ondo);
  });
  it("retains the exact variant and inputs from old shared links", () => {
    const legacy = {mint:ondo.mint,mode:"borrow",amount:"2500",days:"90",loan:"500",decline:"25"};
    expect(resolveVersion(variants,legacy)).toBe(ondo);
    expect(assetUrl({...base,variant:resolveVersion(variants,legacy)!,scenario:parseScenario(legacy),home:true})).toBe("/stocks/tesla/borrow?version=ondo&amount=2500&days=90&loan=500&decline=25");
  });
  it("shares lending inputs without embedding observed financial values", () => {
    expect(assetUrl({...base,scenario:parseScenario({mode:"lend",amount:"1000",days:"30"})})).toBe("/stocks/tesla/lend?amount=1000&days=30");
  });
  it("disambiguates same-issuer versions deterministically", () => {
    const other = {...x,mint:"another-mint"};
    const slugs = [x,other].map(v => versionSlug(v,[x,other]));
    expect(new Set(slugs).size).toBe(2);
    expect(versionSlug(x,[other,x])).toBe(slugs[0]);
    expect(resolveVersion([x,other],{version:slugs[1]})).toBe(other);
  });
});
