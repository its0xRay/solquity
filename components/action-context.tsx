import { ArrowRight } from "lucide-react";

export type ActionKind = "trade" | "earn" | "borrow" | "liquidity";
export function ActionContext({kind, symbol, provider}: {kind: ActionKind; symbol?: string; provider?: string}) {
  const token = symbol ?? "Stock token";
  const copy = {
    trade:{use:"Buy or sell this version through a Solana market.",steps:["Your wallet","Selected venue",token]},
    earn:{use:"Explore lending a holding you plan to keep.",steps:[token,provider ? `${provider} lending` : "Lending market","Variable interest"]},
    borrow:{use:"Access cash without selling your holding.",steps:[token,provider ?? "Lending market","Borrow another asset"]},
    liquidity:{use:"Provide tokens to a pool used by traders.",steps:["Pool tokens",provider ?? "Trading pool","Trading fees"]},
  }[kind];
  return <div className="action-context"><p>{copy.use}</p><ol className="mechanics-flow" aria-label="How it works">{copy.steps.map((step,index) => <li key={index}>{index > 0 ? <ArrowRight size={13} aria-hidden="true" /> : null}<span>{step}</span></li>)}</ol></div>;
}

export function ConceptComparison({kind}: {kind: ActionKind}) {
  const borrow = kind === "borrow";
  const trade = kind === "trade";
  const entries = borrow ? [
    ["Borrow","Keep exposure and take on debt. Interest accrues; a sufficient collateral-price fall can trigger liquidation."],
    ["Sell","Exchange some or all of the holding for cash or another token. You no longer have exposure to the amount sold."],
  ] : trade ? [
    ["Sell","Trade with a buyer through a market at its available price."],
    ["Redeem","Use the issuer’s process to receive cash or shares, subject to its eligibility and terms."],
  ] : [
    ["Lend","Supply an asset to a lending market. The displayed lending rate is variable."],
    ["Provide liquidity","Supply the tokens a trading pool requires. Fees and the value of your pool holding can change."],
  ];
  return <details className="concept-comparison"><summary>{borrow ? "Borrowing or selling?" : trade ? "Selling or redeeming?" : "Lending or providing liquidity?"}</summary><div>{entries.map(([title,copy]) => <section key={title}><h3>{title}</h3><p>{copy}</p></section>)}</div></details>;
}
