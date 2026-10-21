import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsAllowed, analyticsPath, analyticsReferrer, protocolHost, trackEvent } from "../lib/analytics";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("privacy-limited analytics", () => {
  it("removes every query parameter and fragment from clean routes", () => {
    expect(analyticsPath("https://solquity.xyz/stocks/tesla/borrow?amount=12345&loan=500&decline=20&version=ondo#secret")).toBe("/stocks/tesla/borrow");
  });
  it("sanitizes legacy links without forwarding mints or inputs", () => {
    expect(analyticsPath("/?asset=nvidia&mint=private-input&mode=lend&amount=9999&days=90")).toBe("/stocks/nvidia/lend");
    expect(analyticsPath("/?asset=bad%40email.com&amount=1000")).toBe("/");
    expect(analyticsPath("/unknown/personal-value?secret=yes")).toBe("/");
  });
  it("requires opt-in configuration and a production host", () => {
    expect(analyticsAllowed("solquity.xyz", undefined)).toBe(false);
    expect(analyticsAllowed("solquity.xyz", "false")).toBe(false);
    expect(analyticsAllowed("solquity.xyz", "true")).toBe(true);
    expect(analyticsAllowed("localhost", "true")).toBe(false);
    expect(analyticsAllowed("test.vercel.app", "true")).toBe(false);
  });
  it("recognizes only protocol domains, never URL contents", () => {
    expect(protocolHost("https://app.kamino.finance/borrow?amount=1000")).toBe("kamino.finance");
    expect(protocolHost("https://kamino.com.evil.com")).toBeUndefined();
    expect(protocolHost("https://x.com/its0xRay")).toBeUndefined();
  });
  it("keeps referral domains without personal paths or query strings", () => {
    expect(analyticsReferrer("https://example.com/private-path?token=secret")).toBe("https://example.com");
    expect(analyticsReferrer("javascript:alert(1)")).toBe("");
  });
  it("sends only allowed event fields and sanitized page context", () => {
    const gtag = vi.fn();
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "true");
    vi.stubGlobal("window", {location:{hostname:"solquity.xyz",origin:"https://solquity.xyz",href:"https://solquity.xyz/stocks/tesla/lend?amount=54321&loan=500"},gtag});
    trackEvent("scenario_copied", {asset:"tesla",action:"lend",...{amount:"54321",loan:"500"}});
    expect(gtag).toHaveBeenCalledWith("event", "scenario_copied", {asset:"tesla",action:"lend",page_location:"https://solquity.xyz/stocks/tesla/lend",page_referrer:"",page_title:"Solquity"});
    expect(JSON.stringify(gtag.mock.calls)).not.toContain("54321");
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_ENABLED", "false");
    trackEvent("stock_selected", {asset:"nvidia"});
    expect(gtag).toHaveBeenCalledTimes(1);
  });
});
