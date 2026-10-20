import { describe, expect, it } from "vitest";
import { lendingIncome, loanRatio, parseScenario, positiveAmount } from "../lib/scenario";

describe("scenario calculations", () => {
  it("uses effective APY, including an exact full-year return", () => {
    expect(lendingIncome(1000, .2, 365)).toBeCloseTo(200);
    expect(lendingIncome(1000, .002, 30)).toBeCloseTo(.1642, 3);
    expect(lendingIncome(1000, 0, 30)).toBe(0);
  });
  it("rejects invalid inputs rather than generating money values", () => {
    for (const value of ["", "-1", "Infinity", "1e3", "0", "1.234", "1000000001"]) expect(positiveAmount(value)).toBeNull();
    expect(lendingIncome(1000, -1, 30)).toBeNull();
    expect(lendingIncome(1000, .1, 0)).toBeNull();
  });
  it("calculates collateral ratios without assuming a liquidation threshold", () => {
    expect(loanRatio(1000, 200, 20)).toBe(.25);
    expect(loanRatio(1000, 200, 100)).toBeNull();
  });
  it("sanitizes shared inputs and ignores unknown modes", () => {
    expect(parseScenario({ mode: "lend", amount: "-3", days: "999", decline: "NaN" })).toEqual({ mode: "lend", amount: "1000", days: 30, loan: "", decline: 20 });
    expect(parseScenario({ mode: "trade", loan: "200" }).mode).toBeNull();
  });
});
