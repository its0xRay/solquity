import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilityExplorer } from "../components/capability-explorer";
import { buildCapabilityCoverage } from "../lib/capability-coverage";
import { parseScenario } from "../lib/scenario";
import type { AssetDetail } from "../lib/types";

describe("direct asset entry", () => {
  it("shows an asset immediately with the stock strip and collapsed technical context", () => {
    const asset = {assetId:"tesla",name:"Tesla",symbol:"TSLA",category:"equity" as const,stats:{liquidity:1}};
    const detail: AssetDetail = { asset, variants:[{variantId:"one",mint:"mint",symbol:"TSLAx",kind:"stock"}], marketResultsByMint:{},displayMarketsByMint:{},displayCapabilitiesByMint:{},riskResultsByMint:{},fetchedAt:Date.now() };
    const html = renderToStaticMarkup(<CapabilityExplorer assets={[asset]} capabilityCoverage={buildCapabilityCoverage({assets:[],variants:[]})} initialDetail={detail} initialScenario={parseScenario({})} />);
    expect(html).toContain('<h1>Tesla</h1>');
    expect(html).toContain('aria-label="Featured stocks"');
    expect(html).toContain('<details class="variant-details"><summary>Technical details');
    expect(html).not.toContain('class="variant-details" open');
    expect(html).not.toContain('class="breadcrumbs"');
  });
});
