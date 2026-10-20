"use client";

import { ArrowLeft, ArrowUpRight, Check, Link2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssetDetail, CapabilityRecord, ProtocolCapabilityResponse, Variant } from "@/lib/types";
import type { ProtocolCacheEntry } from "@/lib/protocol-cache";
import { isProtocolCacheFresh } from "@/lib/protocol-cache";
import { lendingIncome, loanRatio, positiveAmount, type ScenarioInputs, type ScenarioMode } from "@/lib/scenario";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (ratio: number) => `${(ratio * 100).toLocaleString("en-US", { maximumFractionDigits: ratio > 0 && ratio < .0001 ? 4 : 2 })}%`;
function metric(record: CapabilityRecord, key: string) {
  const value = record.metrics.find(item => item.key === key)?.value;
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function marketName(record: CapabilityRecord) {
  return String(record.metrics.find(item => item.key === "marketName")?.value ?? "Lending market");
}
function updated(record: CapabilityRecord) {
  const date = new Date(record.evidence.observedAt < 1e12 ? record.evidence.observedAt * 1000 : record.evidence.observedAt);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  const stale = record.evidence.status !== "active" || minutes > 5;
  return { stale, text: stale ? `As of ${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}` : minutes < 1 ? "Updated just now" : `Updated ${minutes} min ago` };
}

type Props = {
  detail: AssetDetail;
  selectedMint: string;
  inputs: ScenarioInputs;
  onChange: (value: ScenarioInputs) => void;
  onBack: () => void;
  onSelectMint: (mint: string) => void;
  cached: Record<string, ProtocolCacheEntry>;
  issuerLabel: (variant: Variant) => string;
};

export function ScenarioExplorer({ detail, selectedMint, inputs, onChange, onBack, onSelectMint, cached, issuerLabel }: Props) {
  const [responses, setResponses] = useState<Record<string, ProtocolCapabilityResponse>>(() => Object.fromEntries(Object.entries(cached).map(([mint, value]) => [mint, value.response])));
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [settled, setSettled] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [retry, setRetry] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    const controller = new AbortController();
    async function load(variant: Variant) {
      if (!retry && isProtocolCacheFresh(cached[variant.mint])) {
        setResponses(current => ({ ...current, [variant.mint]: cached[variant.mint].response }));
        setErrors(current => ({ ...current, [variant.mint]: false }));
        setPending(current => ({ ...current, [variant.mint]: false }));
        setSettled(current => ({ ...current, [variant.mint]: true }));
        return;
      }
      setPending(current => ({ ...current, [variant.mint]: true }));
      try {
        const response = await fetch(`/api/capabilities?asset=${encodeURIComponent(detail.asset.assetId)}&mint=${encodeURIComponent(variant.mint)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not refresh");
        const value = await response.json() as ProtocolCapabilityResponse;
        if (!Array.isArray(value.capabilities)) throw new Error("Could not refresh");
        setResponses(current => ({ ...current, [variant.mint]: value }));
        setErrors(current => ({ ...current, [variant.mint]: false }));
      } catch {
        if (!controller.signal.aborted) setErrors(current => ({ ...current, [variant.mint]: true }));
      } finally {
        if (!controller.signal.aborted) {
          setSettled(current => ({ ...current, [variant.mint]: true }));
          setPending(current => ({ ...current, [variant.mint]: false }));
        }
      }
    }
    void Promise.all(detail.variants.map(load));
    return () => controller.abort();
  }, [detail, cached, retry]);

  const mode = inputs.mode ?? "lend";
  const amount = positiveAmount(inputs.amount);
  const loan = positiveAmount(inputs.loan);
  const kind = mode === "lend" ? "earn" : "borrow";
  const allRecords = detail.variants.flatMap(variant => (responses[variant.mint]?.capabilities ?? []).filter(record => record.kind === kind).map(record => ({ variant, record })));
  const current = allRecords.find(item => item.record.id === selectedRecord)
    ?? allRecords.find(item => item.variant.mint === selectedMint)
    ?? allRecords[0];
  const currentRate = current ? metric(current.record, "supplyApy") : null;
  const currentMax = current ? metric(current.record, "maxLtv") : null;
  const currentFresh = current ? updated(current.record) : null;
  const canCalculate = Boolean(current && !currentFresh?.stale && !errors[current.variant.mint]);
  const income = amount && currentRate != null && canCalculate ? lendingIncome(amount, currentRate, inputs.days) : null;
  const startRatio = amount && loan ? loanRatio(amount, loan, 0) : null;
  const afterRatio = amount && loan ? loanRatio(amount, loan, inputs.decline) : null;
  const period = inputs.days === 365 ? "a year" : `${inputs.days} days`;
  const loading = detail.variants.some(variant => pending[variant.mint] || !settled[variant.mint]);
  const changeMode = (next: ScenarioMode) => { setSelectedRecord(null); onChange({ ...inputs, mode: next }); };

  async function copyScenario() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch { setCopyState("error"); }
  }

  return <section className="scenario-workspace" aria-labelledby="scenario-heading">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="/browse">All assets</a><span>/</span><button type="button" onClick={onBack}>{detail.asset.name}</button><span>/</span><span>{mode === "lend" ? "Lend it" : "Borrow against it"}</span></nav>
    <div className="scenario-mobile-nav"><button className="icon-button" type="button" onClick={onBack} aria-label="Back to asset"><ArrowLeft size={20} /></button><span>{detail.asset.name} · {mode === "lend" ? "Lend" : "Borrow"}</span><button className="icon-button" type="button" onClick={copyScenario} aria-label="Copy scenario link"><Link2 size={20} /></button></div>
    <div className="scenario-tabs" role="group" aria-label="Choose an action">
      <button type="button" aria-pressed={mode === "lend"} onClick={() => changeMode("lend")}>Lend</button>
      <button type="button" aria-pressed={mode === "borrow"} onClick={() => changeMode("borrow")}>Borrow</button>
      <button type="button" disabled>Trade · soon</button><button type="button" disabled>Pools · soon</button>
    </div>
    <h1 id="scenario-heading" className="scenario-heading">{mode === "lend" ? <>What could <em>{amount ? wholeDollars.format(amount) : "your holding"}</em> of {detail.asset.name} earn over <em>{period}</em>?</> : <>How much could you borrow against your {detail.asset.name} — and what if it falls?</>}</h1>
    {mode === "lend" ? <div className="scenario-mobile-result"><p className="eyebrow">{amount ? wholeDollars.format(amount) : "Your amount"} · {period} · {current?.variant.symbol ?? detail.asset.symbol}</p><strong>{income != null ? `≈ ${dollars.format(income)}` : "—"}</strong><p>{currentFresh?.stale || (current && errors[current.variant.mint]) ? "The last rate is still visible. Refresh the market for a new estimate." : currentRate != null ? `At today’s ${pct(currentRate)} annual rate. Variable — lending income only, not price changes.` : "Choose an amount to explore the lending markets we find."}</p></div> : null}
    <div className={`scenario-inputs ${mode === "borrow" ? "borrow-inputs" : ""}`}>
      <fieldset><legend>{mode === "lend" ? "Amount" : "Stock value"}</legend><label className="amount-input"><span aria-hidden="true">$</span><input aria-label={mode === "lend" ? "Amount in dollars" : "Collateral value in dollars"} inputMode="decimal" type="text" autoComplete="off" value={inputs.amount} onChange={event => { if (/^\d*\.?\d{0,2}$/.test(event.target.value)) onChange({ ...inputs, amount: event.target.value }); }} aria-invalid={inputs.amount !== "" && amount === null} /></label>{mode === "lend" ? <div className="preset-row">{[100, 1000, 10000].map(value => <button key={value} type="button" aria-pressed={amount === value} onClick={() => onChange({ ...inputs, amount: String(value) })}>{wholeDollars.format(value)}</button>)}</div> : null}{inputs.amount !== "" && !amount ? <small className="input-error">Enter an amount up to $1 billion.</small> : null}</fieldset>
      {mode === "lend" ? <fieldset><legend>Period</legend><div className="period-row">{[7, 30, 90, 365].map(days => <button type="button" key={days} aria-pressed={inputs.days === days} onClick={() => onChange({ ...inputs, days })}>{days === 365 ? "1Y" : `${days}D`}</button>)}</div></fieldset> : <>
        <fieldset><legend>Loan amount</legend><label className="amount-input"><span aria-hidden="true">$</span><input aria-label="Loan amount in dollars" inputMode="decimal" type="text" autoComplete="off" placeholder="Enter an amount" value={inputs.loan} onChange={event => { if (/^\d*\.?\d{0,2}$/.test(event.target.value)) onChange({ ...inputs, loan: event.target.value }); }} aria-invalid={inputs.loan !== "" && loan === null} /></label>{inputs.loan !== "" && !loan ? <small className="input-error">Enter an amount up to $1 billion.</small> : null}</fieldset>
        <fieldset className="decline-input"><legend>If {detail.asset.name} falls by</legend><label htmlFor="price-decline">{inputs.decline}%</label><input id="price-decline" type="range" min="0" max="80" step="1" value={inputs.decline} onChange={event => onChange({ ...inputs, decline: Number(event.target.value) })} /></fieldset>
      </>}
    </div>
    <div className="scenario-columns">
      <section className="comparison-list" aria-label="Compare versions">
        <div className="comparison-caption"><span>Across {detail.variants.length} {detail.variants.length === 1 ? "version" : "versions"} · {allRecords.length} {allRecords.length === 1 ? "market" : "markets"}</span><span>{mode === "lend" ? "Estimates use today’s variable rate" : "Compare reported collateral limits"}</span></div>
        {detail.variants.map(variant => {
          const response = responses[variant.mint];
          const records = (response?.capabilities ?? []).filter(record => record.kind === kind);
          const failed = errors[variant.mint] || response?.providers.kamino?.status === "failed";
          const incomplete = Boolean(response?.providers.kamino?.partial);
          if (!records.length) return <article className="comparison-row empty-comparison" key={variant.mint}>
            <div className="comparison-identity"><strong>{variant.symbol}</strong><span>{issuerLabel(variant)}</span></div>
            <p role="status">{pending[variant.mint] || !settled[variant.mint] ? "Checking markets…" : failed ? "Couldn’t refresh this version. Try again." : incomplete ? "The market check is incomplete. Try again." : `No ${mode === "lend" ? "lending" : "borrowing"} market found across the protocols we check.`}</p>
            {(failed || incomplete) && !pending[variant.mint] ? <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={14} /> Retry</button> : null}
          </article>;
          return records.map(record => {
            const freshness = updated(record);
            const stale = freshness.stale || Boolean(failed);
            const rate = metric(record, "supplyApy");
            const max = metric(record, "maxLtv");
            const result = amount && rate != null && !stale ? lendingIncome(amount, rate, inputs.days) : null;
            return <article className="comparison-row" key={record.id} data-selected={current?.record.id === record.id || undefined}>
              <button type="button" className="comparison-select" aria-pressed={current?.record.id === record.id} onClick={() => { setSelectedRecord(record.id); onSelectMint(variant.mint); }}>
                <span className="comparison-identity"><strong>{variant.symbol}<small>{issuerLabel(variant)}</small></strong><span>{record.provider} · {marketName(record)}</span></span>
                <span className="comparison-rate"><small>{mode === "lend" ? "Current rate" : "Borrow up to"}</small><strong>{mode === "lend" ? rate != null ? `${pct(rate)} APY` : "Not reported" : max != null ? pct(max) : "Not reported"}</strong></span>
                <span className="comparison-result"><small>{mode === "lend" ? "You could earn" : "Based on your stock value"}</small><strong>{mode === "lend" ? result != null ? `≈ ${dollars.format(result)}` : stale ? "Refresh to estimate" : "—" : amount && max != null && !stale ? wholeDollars.format(amount * max) : "—"}</strong></span>
                <span className={`comparison-freshness ${stale ? "is-stale" : ""}`}>{failed ? "Couldn’t refresh · " : ""}{freshness.text}</span>
              </button>
              {record.evidence.appUrl ? <a className="outline-button" href={record.evidence.appUrl} target="_blank" rel="noreferrer">Open {record.provider}<ArrowUpRight size={16} aria-hidden="true" /></a> : null}
            </article>;
          });
        })}
      </section>
      <aside className="scenario-explanation">
        <p className="eyebrow">{mode === "lend" ? "How this is calculated" : "What a price drop changes"}</p>
        {mode === "lend" ? <>
          <p className="explanation-lead">{income != null && amount && currentRate != null ? <>At a <span className="mono">{pct(currentRate)}</span> annual rate, <span className="mono">{wholeDollars.format(amount)}</span> would earn about <em>{dollars.format(income)}</em> over {period}.</> : currentFresh?.stale || (current && errors[current.variant.mint]) ? "The last rate is still visible. Refresh the market before calculating a new estimate." : !current ? loading ? "Checking lending markets for each version…" : "No current lending rate is available for this comparison. Check the market status beside each version." : "Enter an amount to see what the current lending rate would mean for you."}</p>
          {income != null && currentRate != null && amount ? <div className="formula">{wholeDollars.format(amount)} × ((1 + {pct(currentRate)}) ^ ({inputs.days} / 365) − 1)<br />≈ {dollars.format(income)}</div> : null}
          {current ? <ul><li>The rate can change. This estimate holds today’s APY constant over your chosen period.</li><li>This is lending income only. Changes in {detail.asset.name}’s price and transaction costs are separate.</li><li>Each market is shown on its own; rates are never averaged together.</li></ul> : null}
        </> : <>
          <p className="explanation-lead">{amount && loan && startRatio != null && afterRatio != null ? <>Your <span className="mono">{wholeDollars.format(loan)}</span> loan is <em>{pct(startRatio)}</em> of your stock value today. After a {inputs.decline}% fall, it becomes <em>{pct(afterRatio)}</em>.</> : "Enter your stock value and a loan amount to see how a price drop changes their relationship."}</p>
          {amount && loan && afterRatio != null ? <><div className="ratio-track" role="img" aria-label={`Loan would be ${pct(afterRatio)} of collateral after the price drop`}><span style={{ width: `${Math.min(afterRatio * 100, 100)}%` }} /></div><div className="ratio-labels"><span>0%</span><span>After drop: {pct(afterRatio)}</span><span>100%</span></div><p>Stock value after the drop: <span className="mono">{wholeDollars.format(amount * (1 - inputs.decline / 100))}</span></p></> : null}
          {currentMax != null && canCalculate && amount ? <div className="borrow-limit"><span>Reported borrowing limit</span><strong>{wholeDollars.format(amount * currentMax)}</strong><small>{pct(currentMax)} of your stock value · {current?.record.provider}</small>{loan && loan > amount * currentMax ? <p className="input-error">Your entered loan is above this reported limit.</p> : null}</div> : null}
          <p className="muted">The current data does not include a liquidation threshold or borrow-asset terms for this comparison. Check the market for those details.</p>
        </>}
        {current ? <details className="scenario-sources"><summary>View sources and parameters <ArrowUpRight size={15} /></summary><dl><div><dt>Version</dt><dd>{current.variant.symbol}</dd></div><div><dt>Protocol</dt><dd>{current.record.provider}</dd></div><div><dt>Market</dt><dd>{marketName(current.record)}</dd></div><div><dt>Updated</dt><dd>{currentFresh?.text}</dd></div></dl>{current.record.evidence.sourceUrl ? <a href={current.record.evidence.sourceUrl} target="_blank" rel="noreferrer">View source data <ArrowUpRight size={15} /></a> : null}</details> : null}
        {currentFresh?.stale || (current && errors[current.variant.mint]) ? <button className="outline-button" type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} /> Refresh markets</button> : null}
      </aside>
    </div>
    <div className="scenario-share"><p>Share your stock, amount and period. Rates refresh when the link is opened.</p><button className="primary-button" type="button" onClick={copyScenario}>{copyState === "copied" ? <Check size={17} /> : <Link2 size={17} />}{copyState === "copied" ? "Copied" : "Copy link"}</button><span role="status">{copyState === "error" ? "Couldn’t copy. You can copy the address from your browser." : ""}</span></div>
  </section>;
}
