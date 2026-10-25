import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionContext, ConceptComparison } from "../components/action-context";
import { MorePossibilities, VersionContext } from "../components/version-context";
import type { AssetDetail, CapabilityRecord, ProtocolCapabilityResponse } from "../lib/types";

describe("compact contextual UI", () => {
  it("keeps conceptual help closed by default", () => {
    const html = renderToStaticMarkup(<ConceptComparison kind="borrow" />);
    expect(html).toContain("Borrowing or selling?");
    expect(html).not.toContain(" open");
    expect(html).not.toContain("safe until");
    expect(renderToStaticMarkup(<ActionContext kind="borrow" symbol="TSLAx" provider="Kamino" />)).toContain("How it works");
  });
  it("does not render speculative possibilities or stale support", () => {
    const record:CapabilityRecord = {id:"other",assetId:"tesla",mint:"mint",kind:"other",provider:"Test",providerCapability:"Extra action",metrics:[],evidence:{source:"test",sourceUrl:"https://example.com/docs",appUrl:"https://example.com/app",observedAt:Date.now(),fetchedAt:Date.now(),status:"active"}};
    const response:ProtocolCapabilityResponse = {capabilities:[record],providers:{},fetchedAt:Date.now()};
    expect(renderToStaticMarkup(<MorePossibilities mint="mint" />)).toBe("");
    expect(renderToStaticMarkup(<MorePossibilities mint="other-mint" response={response} />)).toBe("");
    expect(renderToStaticMarkup(<MorePossibilities mint="mint" response={response} />)).toContain("More possibilities");
    expect(renderToStaticMarkup(<MorePossibilities mint="mint" response={{...response,capabilities:[{...record,evidence:{...record.evidence,status:"stale"}}]}} />)).toBe("");
  });
  it("keeps sources and comparison closed and labels copy review honestly", () => {
    const variant = {variantId:"x",mint:"mint",kind:"stock",issuer:"xStocks",symbol:"TSLAx"};
    const detail:AssetDetail = {asset:{assetId:"tesla",name:"Tesla",category:"stock"},variants:[variant],marketResultsByMint:{},displayMarketsByMint:{},displayCapabilitiesByMint:{},riskResultsByMint:{},fetchedAt:Date.now()};
    const html = renderToStaticMarkup(<VersionContext detail={detail} selectedMint="mint" onSelect={() => {}} cached={{}} />);
    expect(html).toContain("Copy reviewed Oct 25, 2026");
    expect(html).not.toContain("ownership-expanded");
    expect(html).not.toContain("checked today");
    expect(html).not.toContain("ownership-comparison-grid");
  });
});
