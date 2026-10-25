import { lendingIncome, loanRatio, positiveAmount, type ScenarioInputs } from "./scenario";

export function scenarioChange(previous: ScenarioInputs, current: ScenarioInputs, rate: number | null) {
  if (previous.mode !== current.mode) return null;
  const amount = positiveAmount(current.amount);
  const beforeAmount = positiveAmount(previous.amount);
  if (!amount || !beforeAmount) return null;
  if (current.mode === "lend" && rate != null) {
    const before = lendingIncome(beforeAmount,rate,previous.days);
    const after = lendingIncome(amount,rate,current.days);
    if (before == null || after == null) return null;
    if (previous.days !== current.days) return {kind:"period" as const,before,after,from:previous.days,to:current.days,why:"Same rate, different period. The estimate holds today’s APY constant and excludes stock-price changes."};
    if (previous.amount !== current.amount) return {kind:"amount" as const,before,after,from:beforeAmount,to:amount,why:"Same rate and period, different starting value. The estimate excludes stock-price changes."};
  }
  if (current.mode === "borrow") {
    const loan = positiveAmount(current.loan);
    const beforeLoan = positiveAmount(previous.loan);
    if (!loan || !beforeLoan) return null;
    const before = loanRatio(beforeAmount,beforeLoan,previous.decline);
    const after = loanRatio(amount,loan,current.decline);
    if (before == null || after == null) return null;
    if (previous.decline !== current.decline) return {kind:"decline" as const,before,after,from:previous.decline,to:current.decline,why:"The loan principal stays fixed while the collateral value changes. Interest and other position changes are not included."};
    if (previous.loan !== current.loan) return {kind:"loan" as const,before,after,from:beforeLoan,to:loan,why:"A different loan principal changes its share of the same collateral. Interest is not included."};
    if (previous.amount !== current.amount) return {kind:"collateral" as const,before,after,from:beforeAmount,to:amount,why:"The same loan is measured against a different collateral value. Interest is not included."};
  }
  return null;
}

export function formatScenarioMoney(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < .01) return value < 0 ? "-<$0.01" : "<$0.01";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(Object.is(value,-0) ? 0 : value);
}
