import { describe, expect, it } from "vitest";
import { isVenueEligible, reviewedVenueStatus } from "../lib/venue-status";

describe("reviewed venue status", () => {
  it("excludes only the explicitly reviewed Drift venue", () => {
    const drift = { address: "market", source: "dRiFt" };
    const raydium = { address: "market", source: "Raydium Clamm" };
    expect(isVenueEligible(drift)).toBe(false);
    expect(reviewedVenueStatus(drift)?.status).toBe("excluded");
    expect(isVenueEligible(raydium)).toBe(true);
    expect(reviewedVenueStatus(raydium)).toBeNull();
  });

  it("does not automatically exclude an unattributed or failed venue", () => {
    expect(isVenueEligible({ address: "market" })).toBe(true);
  });
});
