import { formatScenarioMoney, type scenarioChange } from "@/lib/scenario-explanation";

export function ScenarioChange({change}: {change:ReturnType<typeof scenarioChange>}) {
  if (!change) return null;
  const percent = (value:number) => `${(value * 100).toLocaleString("en-US",{maximumFractionDigits:2})}%`;
  const days = (value:number) => value === 365 ? "1Y" : `${value}D`;
  const field = change.kind === "period" ? `Period ${days(change.from)} → ${days(change.to)}`
    : change.kind === "decline" ? `Price drop ${change.from}% → ${change.to}%`
    : `${change.kind === "loan" ? "Loan" : change.kind === "collateral" ? "Stock value" : "Amount"} ${formatScenarioMoney(change.from)} → ${formatScenarioMoney(change.to)}`;
  const result = change.kind === "period" || change.kind === "amount" ? `${formatScenarioMoney(change.before)} → ${formatScenarioMoney(change.after)}` : `Loan share ${percent(change.before)} → ${percent(change.after)}`;
  return <div className="scenario-change" aria-live="polite"><div><span>{field}</span><span>{result}</span></div><p>{change.why}</p></div>;
}
