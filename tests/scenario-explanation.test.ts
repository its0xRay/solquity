import { describe, expect, it } from "vitest";
import { formatScenarioMoney, scenarioChange } from "../lib/scenario-explanation";
import { parseScenario } from "../lib/scenario";

describe("scenario changes explain entered inputs, not market sentiment", () => {
  it("compares periods at the same rate using the existing APY formula", () => {
    const before = parseScenario({mode:"lend",amount:"1000",days:"30"});
    const result = scenarioChange(before,{...before,days:365},.002);
    expect(result?.kind).toBe("period");
    expect(result?.before).toBeCloseTo(.1642338,5);
    expect(result?.after).toBeCloseTo(2,8);
  });
  it("explains principal-to-collateral changes without a liquidation or safety claim", () => {
    const before = parseScenario({mode:"borrow",amount:"1000",loan:"200",decline:"0"});
    const result = scenarioChange(before,{...before,decline:20},null);
    expect(result?.before).toBe(.2);
    expect(result?.after).toBe(.25);
    expect(result?.why).toContain("Interest");
    expect(result?.why).not.toContain("safe");
  });
  it("does not invent an illustration for invalid inputs, mode changes or missing rates", () => {
    const before = parseScenario({mode:"lend"});
    expect(scenarioChange(before,{...before,amount:""},.01)).toBeNull();
    expect(scenarioChange(before,{...before,days:90},null)).toBeNull();
    expect(scenarioChange(before,{...before,mode:"borrow"},.01)).toBeNull();
  });
  it("handles tiny, zero, large and missing monetary results", () => {
    expect(formatScenarioMoney(.004)).toBe("<$0.01");
    expect(formatScenarioMoney(-0)).toBe("$0.00");
    expect(formatScenarioMoney(1e9)).toBe("$1,000,000,000.00");
    expect(formatScenarioMoney(null)).toBe("—");
    expect(formatScenarioMoney(Infinity)).toBe("—");
  });
});
