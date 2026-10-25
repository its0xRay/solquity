import type { Variant } from "./types";

export type IssuerId = "xstocks" | "ondo" | "backpack";
export type IssuerSource = { id: string; label: string; url: string };
export type RedemptionRoute = { label: string; steps: string[]; note: string; sourceId: string; url: string };
export type IssuerContent = {
  id: IssuerId; name: string; reviewedAt: string;
  holding: string; backing: string; dividends: string; redemption: string;
  ownershipNote: string; costs: string; eligibility: string;
  sources: IssuerSource[]; routes: RedemptionRoute[];
};

// Editorial snapshots, not live attestations. Source checks never advance reviewedAt.
export const issuerContent: Record<IssuerId, IssuerContent> = {
  xstocks: {
    id:"xstocks", name:"xStocks", reviewedAt:"2026-10-25",
    holding:"A tracker certificate, not a company share.",
    backing:"Underlying shares held with regulated custodians.",
    dividends:"Reinvested through the display multiplier, net of withholding tax.",
    redemption:"Shares or cash, through eligible issuer routes.",
    ownershipNote:"The token represents a financial instrument tracking the underlying equity. It does not give shareholder voting rights. Scaled balances can change after dividends or splits.",
    costs:"Cash route: $5,000 minimum. Share-route limits depend on onboarding. Check current fees before converting.",
    eligibility:"Issuer onboarding and a whitelisted wallet are required. The share route also requires Alpaca onboarding.",
    sources:[
      {id:"xstocks-legal",label:"Product structure",url:"https://docs.xstocks.fi/docs/product-legal-overview"},
      {id:"xstocks-dividends",label:"Dividends and splits",url:"https://docs.xstocks.fi/docs/dividends-and-stock-splits"},
      {id:"xstocks-shares",label:"Share conversion · xPort",url:"https://docs.xstocks.fi/docs/issuance-and-redemption/in-kind-flow-xport"},
      {id:"xstocks-cash",label:"Cash redemption",url:"https://docs.xstocks.fi/docs/issuance-and-redemption/market-flow"},
    ],
    routes:[
      {label:"To shares",steps:["Your token","xPort · Alpaca","Brokerage shares"],note:"Requires issuer and Alpaca onboarding.",sourceId:"xstocks-shares",url:"https://docs.xstocks.fi/docs/issuance-and-redemption/in-kind-flow-xport"},
      {label:"To cash",steps:["Your token","Issuer redemption","Stablecoins"],note:"Issuer onboarding, a whitelisted wallet and a $5,000 minimum apply.",sourceId:"xstocks-cash",url:"https://docs.xstocks.fi/docs/issuance-and-redemption/market-flow"},
    ],
  },
  ondo: {
    id:"ondo", name:"Ondo", reviewedAt:"2026-10-25",
    holding:"A total-return token, not direct share ownership.",
    backing:"Underlying securities and cash in transit.",
    dividends:"Reinvested in the exposure, net of withholding tax.",
    redemption:"Cash or stablecoins for eligible holders.",
    ownershipNote:"The token tracks the economics of holding the underlying asset with dividends reinvested. One raw token need not equal one share; supported Solana wallets adjust the displayed balance and price. It does not give shareholder voting rights.",
    costs:"Review the issuer’s current quote and fees. Market selling and direct issuer redemption are separate routes.",
    eligibility:"Direct redemption requires issuer onboarding and jurisdictional eligibility. Holding the token alone does not establish eligibility.",
    sources:[
      {id:"ondo-structure",label:"Ownership, backing and dividends",url:"https://docs.ondo.finance/ondo-stocks/overview"},
      {id:"ondo-redemption",label:"Redemption terms",url:"https://docs.ondo.finance/ondo-stocks/investing-and-redeeming"},
    ],
    routes:[{label:"To cash",steps:["Your token","Ondo redemption","Cash or stablecoins"],note:"Available to eligible, onboarded holders, subject to the issuer’s terms and availability.",sourceId:"ondo-redemption",url:"https://docs.ondo.finance/ondo-stocks/investing-and-redeeming"}],
  },
  backpack: {
    id:"backpack", name:"Backpack", reviewedAt:"2026-10-25",
    holding:"A token redeemable for a corresponding security entitlement.",
    backing:"Corresponding securities through brokerage infrastructure.",
    dividends:"Cash dividends reinvested as additional tokens.",
    redemption:"Corresponding shares in a Backpack account.",
    ownershipNote:"Depositing the token to Backpack burns it and credits the corresponding securities holding to the account. Moving that holding to another brokerage is a separate process.",
    costs:"The published mint/redeem route has no conversion fee. Other transfers and network costs are separate.",
    eligibility:"An eligible Backpack Securities account is required. Outbound transfers to another brokerage are currently in private access.",
    sources:[{id:"backpack-structure",label:"Ownership and conversion",url:"https://ui.backpack.exchange/tokenized-stocks"}],
    routes:[{label:"Shares ↔ tokens",steps:["Solana token","Backpack Securities","Account shares"],note:"For Backpack-issued tokens and eligible accounts. A transfer to another brokerage is separate.",sourceId:"backpack-structure",url:"https://ui.backpack.exchange/tokenized-stocks"}],
  },
};

export function issuerId(variant: Variant): IssuerId | undefined {
  // This API version omits the issuer for TSLA. Match the published mint, never the ticker or redemption tier.
  if (variant.mint === "TSLAqBbv4CNCnzWFeB7LmydAyEiNMJtve7DYKLpdK4S") return "backpack";
  const identity = `${variant.issuer ?? ""} ${variant.label ?? ""} ${variant.issuerUrl ?? ""}`.toLowerCase();
  if (identity.includes("backpack")) return "backpack";
  if (identity.includes("xstock")) return "xstocks";
  if (identity.includes("ondo")) return "ondo";
  return undefined;
}

export function contentFor(variant: Variant) {
  const id = issuerId(variant);
  // Do not apply stock terms to unrelated product families from the same issuer.
  if (!id || !["stock","etf","equity","tokenized_stock","tokenized_equity"].includes(variant.kind.toLowerCase())) return undefined;
  return issuerContent[id];
}

export function redemptionLabel(variant: Variant) {
  const content = contentFor(variant);
  if (content?.id === "xstocks") return "Shares or cash";
  if (content?.id === "backpack") return "Redeems for shares";
  if (content?.id === "ondo") return "Redeems for cash";
  return variant.stockVariantTier === "share_redeemable" ? "Redeems for shares" : variant.stockVariantTier === "cash_redeemable" ? "Redeems for cash" : variant.stockVariantTier === "not_redeemable" ? "Not redeemable now" : "Redemption unknown";
}
