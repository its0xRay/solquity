import { z } from "zod";
import { NormalizedEnrichmentRecord, RawEnrichmentEnvelope } from "../enrichment";
import { sourceFailure, sourcePartial, sourceSuccess } from "../source-result";
import { requestSignal } from "../request-signal";
import type { CapabilityRecord, SourceResult, VenueMarket } from "../types";
import type { AdapterContext, CapabilityAdapter } from "./types";

const CACHE_MS = 120_000;
const BASES: Record<MeteoraPoolFamily, string> = {
  "dlmm": "https://dlmm.datapi.meteora.ag/pools",
  "damm-v2": "https://damm-v2.datapi.meteora.ag/pools",
};

const windowMetricsSchema = z.object({
  "30m": z.number().optional(), "1h": z.number().optional(), "2h": z.number().optional(), "4h": z.number().optional(), "12h": z.number().optional(), "24h": z.number().optional(),
}).passthrough();

export const meteoraPoolSchema = z.object({
  address: z.string(),
  name: z.string(),
  token_x: z.object({ address: z.string(), symbol: z.string().optional() }).passthrough(),
  token_y: z.object({ address: z.string(), symbol: z.string().optional() }).passthrough(),
  apr: z.number().optional(),
  apy: z.number().optional(),
  farm_apr: z.number().optional(),
  farm_apy: z.number().optional(),
  tvl: z.number().optional(),
  dynamic_fee_pct: z.number().optional(),
  pool_config: z.object({
    base_fee_pct: z.number().optional(),
    bin_step: z.number().optional(),
  }).passthrough().optional(),
  volume: windowMetricsSchema.optional(),
  fees: windowMetricsSchema.optional(),
  is_blacklisted: z.boolean().optional(),
  has_farm: z.boolean().optional(),
}).passthrough();

export type MeteoraPool = z.infer<typeof meteoraPoolSchema>;
export type MeteoraPoolFamily = "dlmm" | "damm-v2";

type CachedPool = { pool: MeteoraPool; fetchedAt: number };
const poolCache = new Map<string, CachedPool>();

function familyForMarket(market: VenueMarket): MeteoraPoolFamily | null {
  const source = market.source?.toLocaleLowerCase() ?? "";
  if (source.includes("meteora") && source.includes("dlmm")) return "dlmm";
  if (source.includes("meteora") && (source.includes("damm v2") || source.includes("damm-v2"))) return "damm-v2";
  return null;
}

function meteoraAppUrl(family: MeteoraPoolFamily, address: string) {
  return family === "dlmm" ? `https://www.meteora.ag/dlmm/${address}` : `https://www.meteora.ag/pools/${address}`;
}

async function fetchPool(address: string, family: MeteoraPoolFamily, signal?: AbortSignal): Promise<CachedPool> {
  const key = `${family}:${address}`;
  const cached = poolCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  const response = await fetch(`${BASES[family]}/${encodeURIComponent(address)}`, {
    signal: requestSignal(signal, 5_000), next: { revalidate: 120 },
  });
  if (!response.ok) throw new Error(`Meteora returned ${response.status}`);
  const value = { pool: meteoraPoolSchema.parse(await response.json()), fetchedAt: Date.now() };
  poolCache.set(key, value);
  return value;
}

export function normalizeMeteoraPool(raw: RawEnrichmentEnvelope<MeteoraPool>, family: MeteoraPoolFamily): NormalizedEnrichmentRecord | null {
  const pool = raw.payload;
  if (pool.is_blacklisted === true || pool.address !== raw.marketId || (pool.token_x.address !== raw.mint && pool.token_y.address !== raw.mint)) return null;
  const metrics: NormalizedEnrichmentRecord["metrics"] = [];
  const push = (key: string, label: string, value: number | undefined, unit: string, rawPath: string) => {
    if (value != null) metrics.push({ key, label, value, unit, rawPath });
  };
  push("apr24h", "24h APR", pool.apr, "percent", "apr");
  push("apy24h", "24h APY", pool.apy, "percent", "apy");
  push("farmApr", "Farm APR", pool.farm_apr, "percent", "farm_apr");
  push("farmApy", "Farm APY", pool.farm_apy, "percent", "farm_apy");
  push("tvl", "TVL", pool.tvl, "usd", "tvl");
  push("dynamicFee", "Dynamic fee", pool.dynamic_fee_pct, "percent", "dynamic_fee_pct");
  push("baseFee", "Base fee", pool.pool_config?.base_fee_pct, "percent", "pool_config.base_fee_pct");
  push("binStep", "Bin step", pool.pool_config?.bin_step, "count", "pool_config.bin_step");
  push("volume24h", "24h volume", pool.volume?.["24h"], "usd", "volume.24h");
  push("fees24h", "24h fees", pool.fees?.["24h"], "usd", "fees.24h");
  return {
    provider: "Meteora",
    marketId: raw.marketId,
    mint: raw.mint,
    capability: "liquidity",
    metrics,
    sourceUrl: `${family === "dlmm" ? "https://dlmm.datapi.meteora.ag" : "https://damm-v2.datapi.meteora.ag"}/pools/${raw.marketId}`,
    fetchedAt: raw.fetchedAt,
  };
}

function capabilityFromPool(context: AdapterContext, market: VenueMarket, family: MeteoraPoolFamily, value: CachedPool): CapabilityRecord | null {
  const raw: RawEnrichmentEnvelope<MeteoraPool> = {
    provider: "Meteora", marketId: market.address, mint: context.mint, fetchedAt: value.fetchedAt, payload: value.pool,
  };
  const normalized = normalizeMeteoraPool(raw, family);
  if (!normalized) return null;
  const methodology = "Reported by Meteora for this exact Tokens.xyz market and variant mint";
  const metrics: CapabilityRecord["metrics"] = [
    { key: "poolName", label: "Pool", value: value.pool.name, unit: "text", methodology },
    { key: "poolType", label: "Pool type", value: family === "dlmm" ? "DLMM" : "DAMM v2", unit: "text", methodology },
    ...normalized.metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      value: metric.value,
      unit: metric.unit === "usd" ? "usd" as const : metric.unit === "percent" ? "percent" as const : "text" as const,
      methodology,
    })),
  ];
  return {
    id: `${context.mint}:liquidity:meteora:${market.address}`,
    assetId: context.assetId,
    mint: context.mint,
    kind: "liquidity",
    provider: "Meteora",
    providerCapability: family,
    marketId: market.address,
    metrics,
    evidence: {
      source: "Meteora",
      appUrl: meteoraAppUrl(family, market.address),
      sourceUrl: normalized.sourceUrl,
      observedAt: value.fetchedAt,
      fetchedAt: Date.now(),
      status: "active",
    },
  };
}

export async function meteoraCapabilities(context: AdapterContext): Promise<SourceResult<CapabilityRecord[]>> {
  const markets = (context.markets ?? []).flatMap((market) => {
    const family = familyForMarket(market);
    return family && market.address ? [{ market, family }] : [];
  });
  if (!markets.length) return sourceSuccess([]);
  const settled = await Promise.allSettled(markets.map(async ({ market, family }) =>
    capabilityFromPool(context, market, family, await fetchPool(market.address, family, context.signal))));
  const records = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const failedItems = settled.filter((result) => result.status === "rejected").length;
  if (!records.length && failedItems) return sourceFailure(new Error("Meteora pool details unavailable"));
  if (failedItems) return sourcePartial(records, failedItems);
  return sourceSuccess(records);
}

export const meteoraAdapter: CapabilityAdapter = {
  id: "meteora",
  label: "Meteora",
  requiresMarkets: true,
  async discover() { return sourceSuccess([]); },
  capabilities: meteoraCapabilities,
};
