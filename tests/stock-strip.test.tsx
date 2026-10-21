import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StockStrip, STRIP_START_DELAY_MS, STRIP_PIXELS_PER_SECOND, STRIP_INTERACTION_PAUSE_MS } from "../components/stock-strip";
import { buildCapabilityCoverage } from "../lib/capability-coverage";

const coverage = buildCapabilityCoverage({ assets: [], variants: [] });
describe("featured stock strip", () => {
  it("renders stock choices, selected state and an explicit pause control", () => {
    const html = renderToStaticMarkup(<StockStrip assets={[{assetId:"tesla", name:"Tesla", symbol:"TSLA", category:"equity", stats:{liquidity:1}},{assetId:"nvidia",name:"NVIDIA",symbol:"NVDA",category:"equity",stats:{liquidity:2}}]} coverage={coverage} selectedId="tesla" onSelect={() => {}} />);
    expect(html).toContain('aria-label="Featured stocks"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Pause stock strip"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
  });
  it("starts promptly, moves slowly and pauses briefly after interaction", () => {
    expect(STRIP_START_DELAY_MS).toBe(700);
    expect(STRIP_PIXELS_PER_SECOND).toBe(12);
    expect(STRIP_INTERACTION_PAUSE_MS).toBe(4000);
  });
  it("does not render an empty strip", () => {
    expect(renderToStaticMarkup(<StockStrip assets={[]} coverage={coverage} onSelect={() => {}} />)).toBe("");
  });
});
