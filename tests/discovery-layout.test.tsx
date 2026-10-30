import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilityExplorer } from "../components/capability-explorer";
import { BrowseAssets } from "../components/browse-assets";
import { parseScenario } from "../lib/scenario";
import type { AssetDetail } from "../lib/types";

const detail: AssetDetail = {
  asset:{assetId:"tesla",name:"Tesla",symbol:"TSLA",category:"stock"},
  variants:[{variantId:"x",mint:"mint",kind:"stock",issuer:"xStocks",symbol:"TSLAx"}],
  marketResultsByMint:{},displayMarketsByMint:{},displayCapabilitiesByMint:{},riskResultsByMint:{},fetchedAt:Date.now(),
};
const coverage = {byAsset:{},byMint:{},mintsByAsset:{}};

describe("consumer discovery layout", () => {
  it("shows discovery, editable amount and named uses without opening details", () => {
    const html = renderToStaticMarkup(<CapabilityExplorer assets={[detail.asset]} capabilityCoverage={coverage} initialDetail={detail} initialScenario={parseScenario({})} homeRoute />);
    expect(html).toContain("Stocks you know.");
    expect(html).toContain("Now on Solana.");
    expect(html).toContain("Explore amount in dollars");
    expect(html).toContain("version-use-dots");
    expect(html).not.toContain("scenario-embedded");
    expect(html).not.toContain("ownership-summary");
    expect(html).not.toContain("try-amount-card");
    expect(html).toContain("homepage-intro");
    expect(html).toContain("See all");
    expect(html).toContain("Solana");
    expect(html).toContain("open 24/7");
    expect(html).not.toContain("footer-market-compact");
    expect(html.indexOf("homepage-intro")).toBeLessThan(html.indexOf('class="stock-picker"'));
  });
  it("uses complete footer labels when a US reference market exists", () => {
    const html = renderToStaticMarkup(<CapabilityExplorer assets={[detail.asset]} capabilityCoverage={coverage} initialDetail={{...detail,asset:{...detail.asset,canonicalMarket:{source:"NASDAQ"}}}} initialScenario={parseScenario({})} />);
    expect(html).toContain("US markets");
    expect(html).not.toContain("Solana markets");
    expect(html).not.toContain("footer-market-compact");
  });
  it("keeps direct asset links compact", () => {
    const html = renderToStaticMarkup(<CapabilityExplorer assets={[detail.asset]} capabilityCoverage={coverage} initialDetail={detail} initialScenario={parseScenario({})} />);
    expect(html).not.toContain("homepage-intro");
    expect(html).toContain("compact-stock-picker");
    expect(html).toContain("See all");
  });
  it("opens a shared borrowing scenario while market checks are still pending", () => {
    const html = renderToStaticMarkup(<CapabilityExplorer assets={[detail.asset]} capabilityCoverage={coverage} initialDetail={detail} initialScenario={parseScenario({mode:"borrow",amount:"1000",loan:"200",decline:"20"})} homeRoute />);
    expect(html).toContain("scenario-embedded");
    expect(html).toContain("Borrowing scenario");
    expect(html).toContain('value="200"');
    expect(html).toContain("25%");
    expect(html).not.toContain("safe until");
    expect(html).not.toContain("scenario-tabs");
    expect(html).not.toContain("homepage-intro");
  });
  it("keeps stock filtering and clean directory links", () => {
    const html = renderToStaticMarkup(<BrowseAssets assets={[detail.asset]} capabilityCoverage={coverage} initialType="equity" />);
    expect(html).toContain("browse-directory");
    expect(html).toContain('href="/stocks/tesla"');
    expect(html).not.toContain("No matching assets");
  });
  it("shows checked uses from every exact version in the directory", () => {
    const html = renderToStaticMarkup(<BrowseAssets assets={[{...detail.asset,variants:detail.variants}]} capabilityCoverage={{...coverage,byMint:{mint:["borrow"]}}} />);
    expect(html).toContain("Borrow");
    expect(html).not.toContain("No verified actions yet");
  });
});
