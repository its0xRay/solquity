import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenarioExplorer } from "../components/scenario-explorer";
import type { AssetDetail, CapabilityRecord, ProtocolCapabilityResponse } from "../lib/types";
import type { ScenarioInputs } from "../lib/scenario";

const now = Date.now();
const variant = { variantId: "one", mint: "mint-one", kind: "stock", symbol: "TESTx", issuer: "Test issuer" };
const detail: AssetDetail = {
  asset: { assetId: "test", name: "Test stock", symbol: "TEST", category: "equity" },
  variants: [variant], marketResultsByMint: {}, displayMarketsByMint: {}, displayCapabilitiesByMint: {}, riskResultsByMint: {}, fetchedAt: now,
};
function record(status: "active" | "stale", apy = .002): CapabilityRecord {
  return { id: "lending-one", assetId: "test", mint: variant.mint, kind: "earn", provider: "Test protocol", providerCapability: "lending_reserve", metrics: [{ key: "supplyApy", label: "Supply APY", value: apy, unit: "ratio" }], evidence: { source: "Test protocol", observedAt: now, fetchedAt: now, status } };
}
function render(records: CapabilityRecord[], overrides: Partial<ScenarioInputs> = {}) {
  const response: ProtocolCapabilityResponse = { capabilities: records, providers: { kamino: { label: "Test protocol", status: "success", fetchedAt: now } }, fetchedAt: now };
  return renderToStaticMarkup(<ScenarioExplorer detail={detail} selectedMint={variant.mint} inputs={{ mode: "lend", amount: "1000", days: 30, loan: "", decline: 20, ...overrides }} onChange={() => {}} onBack={() => {}} onSelectMint={() => {}} cached={{ [variant.mint]: { response, cachedAt: now } }} issuerLabel={() => "Test issuer"} />);
}

describe("scenario evidence boundaries", () => {
  it("renders an estimate from a current APY", () => {
    const html = render([record("active")]);
    expect(html).toContain("≈ $0.16");
    expect(html).toContain("0.2% APY");
  });
  it("keeps stale facts but does not produce a new estimate", () => {
    const html = render([record("stale")]);
    expect(html).toContain("0.2% APY");
    expect(html).toContain("Refresh to estimate");
    expect(html).not.toContain("≈ $0.16");
  });
  it("accepts a zero APY as a valid current rate", () => {
    expect(render([record("active", 0)])).toContain("≈ $0.00");
  });
  it("does not calculate from an invalid amount", () => {
    const html = render([record("active")], { amount: "0" });
    expect(html).not.toContain("≈ $");
    expect(html).toContain('aria-invalid="true"');
  });
  it("shows price-drop arithmetic without fabricating liquidation terms", () => {
    const html = render([], { mode: "borrow", amount: "1000", loan: "200", decline: 20 });
    expect(html).toContain("25%");
    expect(html).toContain("$800");
    expect(html).toContain("does not include a liquidation threshold");
  });
});
