export type MarketSnapshot = {
  price?: number | null;
  liquidity?: number | null;
  volume24hUSD?: number | null;
  trade24h?: number | null;
  uniqueWallet24h?: number | null;
  priceChange24hPercent?: number | null;
  lastTradeAt?: number | null;
  asOf?: number | null;
  lastFetchedAt?: number | null;
  logoURI?: string | null;
};

export type ExecutionQuality = {
  executionScore?: number | null;
  feeBps?: number | null;
  flowSourceCount?: number | null;
  botVolumeRatio?: number | null;
  isEligibleForPrimary?: boolean;
  asOf?: number | null;
  lastComputedAt?: number | null;
};

export type Variant = {
  variantId: string;
  mint: string;
  kind: string;
  issuer?: string;
  issuerUrl?: string;
  label?: string;
  stockVariantTier?: "share_redeemable" | "cash_redeemable" | "not_redeemable";
  symbol?: string;
  name?: string;
  liquidityTier?: string;
  market?: MarketSnapshot | null;
  executionQuality?: ExecutionQuality | null;
};

export type Asset = {
  assetId: string;
  name?: string;
  symbol?: string;
  category: string;
  imageUrl?: string | null;
  description?: string | null;
  stats?: {
    price?: number | null;
    liquidity?: number | null;
    volume24hUSD?: number | null;
    volume30dUSD?: number | null;
    priceChange24hPercent?: number | null;
  } | null;
  canonicalMarket?: {
    source?: string;
    price?: number | null;
    priceChange24hPercent?: number | null;
    asOf?: number | null;
    lastFetchedAt?: number | null;
  } | null;
  primaryVariant?: Variant | null;
  variants?: Variant[];
};

export type VenueMarket = {
  address: string;
  name?: string;
  source?: string;
  liquidity?: number | null;
  price?: number | null;
  volume24h?: number | null;
  trade24h?: number | null;
  uniqueWallet24h?: number | null;
  base?: { address?: string; symbol?: string; icon?: string };
  quote?: { address?: string; symbol?: string; icon?: string };
  protocol?: { address?: string; symbol?: string; name?: string } | null;
};

export type RiskSummary = {
  assetId?: string;
  mint?: string;
  risk?: {
    ok?: boolean;
    marketScore?: {
      score?: number | null;
      grade?: string | null;
      label?: string | null;
      tone?: string | null;
      caps?: string[];
      borderlineSignals?: string[];
      hasInsufficientData?: boolean;
      insufficientDataReason?: string | null;
      components?: Record<string, { score?: number | null; status?: string; hasData?: boolean }>;
    } | null;
    marketScoreInput?: Record<string, number | string | null> | null;
    lastUpdatedAt?: number | null;
  } | null;
};

export type PriceCandle = {
  time: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
};

export type SourceResult<T> =
  | { status: "success"; data: T; fetchedAt: number; partial?: { failedItems: number } }
  | { status: "stale"; data: T; fetchedAt: number; observedAt: number; error: { code: string; message: string } }
  | { status: "failed"; data: null; fetchedAt: number; error: { code: string; message: string } };

export type VariantDescription = { assetId: string; mint: string; description: string | null };

export type AssetDetail = {
  asset: Asset;
  variants: Variant[];
  marketResultsByMint: Record<string, SourceResult<VenueMarket[]>>;
  displayMarketsByMint: Record<string, VenueMarket[]>;
  displayCapabilitiesByMint: Record<string, CapabilityRecord[]>;
  riskResultsByMint: Record<string, SourceResult<RiskSummary>>;
  fetchedAt: number;
};

export type AssetAuditDetail = AssetDetail & {
  riskDetailResultsByMint: Record<string, SourceResult<RiskSummary>>;
  descriptionResultsByMint: Record<string, SourceResult<VariantDescription>>;
  chartResult: SourceResult<PriceCandle[]>;
};

export type CapabilityKind = "trade" | "liquidity" | "earn" | "borrow" | "perpetuals" | "rewards" | "other";
export type EvidenceStatus = "active" | "stale" | "unsupported" | "failed";

export type CapabilityMetric = {
  key: string;
  label: string;
  value: number | string;
  unit?: "usd" | "percent" | "count" | "ratio" | "text";
  methodology?: string;
};

export type CapabilityEvidence = {
  source: string;
  appUrl?: string;
  sourceUrl?: string;
  observedAt: number;
  fetchedAt: number;
  status: EvidenceStatus;
};

export type CapabilityRecord = {
  id: string;
  assetId: string;
  mint: string;
  kind: CapabilityKind;
  provider: string;
  providerCapability: string;
  marketId?: string;
  metrics: CapabilityMetric[];
  evidence: CapabilityEvidence;
};

export type CapabilityProviderState = {
  label: string;
  status: SourceResult<unknown>["status"];
  fetchedAt: number;
  partial?: { failedItems: number };
  error?: { code: string; message: string };
};

export type ProtocolCapabilityResponse = {
  capabilities: CapabilityRecord[];
  providers: Record<string, CapabilityProviderState>;
  fetchedAt: number;
};
