export type ScenarioMode = "lend" | "borrow";
export type ScenarioInputs = { mode: ScenarioMode | null; amount: string; days: number; loan: string; decline: number };

export function positiveAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? amount : null;
}

export function lendingIncome(amount: number, apy: number, days: number): number | null {
  if (![amount, apy, days].every(Number.isFinite) || amount <= 0 || apy < 0 || days <= 0 || days > 365) return null;
  const value = amount * Math.expm1(Math.log1p(apy) * days / 365);
  return Number.isFinite(value) ? value : null;
}

export function loanRatio(collateral: number, loan: number, decline: number): number | null {
  if (![collateral, loan, decline].every(Number.isFinite) || collateral <= 0 || loan <= 0 || decline < 0 || decline >= 100) return null;
  return loan / (collateral * (1 - decline / 100));
}

export function parseScenario(params: { mode?: string; amount?: string; days?: string; loan?: string; decline?: string }): ScenarioInputs {
  const days = Number(params.days);
  const decline = Number(params.decline);
  return {
    mode: params.mode === "lend" || params.mode === "borrow" ? params.mode : null,
    amount: params.amount && positiveAmount(params.amount) !== null ? params.amount : "1000",
    days: [7, 30, 90, 365].includes(days) ? days : 30,
    loan: params.loan && positiveAmount(params.loan) !== null ? params.loan : "",
    decline: Number.isFinite(decline) && decline >= 0 && decline <= 80 ? decline : 20,
  };
}
