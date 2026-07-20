import { z } from "zod";
import { NormalizedEnrichmentRecord, RawEnrichmentEnvelope } from "../enrichment";
import { sourceFailure, sourcePartial, sourceSuccess } from "../source-result";
import { requestSignal } from "../request-signal";
import type { CapabilityRecord, SourceResult, VenueMarket } from "../types";
import type { AdapterContext, CapabilityAdapter } from "./types";

const CACHE_MS = 60_000;
const API_BASE = "https://api-v3.raydium.io/pools/info/ids";

const periodSchema = z.object({
  volume: z.number().optional(),
  volumeQuote: z.number().optional(),
  volumeFee: z.number().optional(),
  apr: z.number().optional(),
  feeApr: z.number().optional(),
}).passthrough();

export const raydiumPoolSchema = z.object({
  id: z.string(),
  type: z.string(),
  programId: z.string(),
  mintA: z.object({ address: z.string(), symbol: z.string().optional() }).passthrough(),
  mintB: z.object({ address: z.string(), symbol: z.string().optional() }).passthrough(),
  feeRate: z.number().optional(),
  tvl: z.number().optional(),
  day: periodSchema.optional(),
  week: periodSchema.optional(),
  month: periodSchema.optional(),
  pooltype: z.array(z.string()).optional(),
  config: z.object({ tickSpacing: z.number().optional() }).passthrough().optional(),
}).passthrough();

export const raydiumPoolsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(raydiumPoolSchema),
}).passthrough();

export type RaydiumPool = z.infer<typeof raydiumPoolSchema>;
type CachedPool = { pool: RaydiumPool; fetchedAt: number };
const poolCache = new Map<string, CachedPool>();

function isRaydiumMarket(market: VenueMarket) {
  return /^raydium(?: |$)/i.test(market.source ?? "") && Boolean(market.address);
}

export function raydiumAppUrl(address: string) {
  return `https://raydium.io/liquidity/increase/?mode=add&pool_id=${encodeURIComponent(address)}`;
}

async function fetchPools(addresses: string[], signal?: AbortSignal): Promise<{ pools: Map<string, CachedPool>; failedItems: number }> {
  const now = Date.now();
  const result = new Map<string, CachedPool>();
  const missing: string[] = [];
  for (const address of addresses) {
    const cached = poolCache.get(address);
    if (cached && now - cached.fetchedAt < CACHE_MS) result.set(address, cached);
    else missing.push(address);
  }
  if (missing.length) {
    try {
      const response = await fetch(`${API_BASE}?ids=${missing.map(encodeURIComponent).join(",")}`, {
        signal: requestSignal(signal, 8_000), next: { revalidate: 60 },
      });
      if (!response.ok) throw new Error(`Raydium returned ${response.status}`);
      const parsed = raydiumPoolsResponseSchema.parse(await response.json());
      const fetchedAt = Date.now();
      for (const pool of parsed.data) {
        const value = { pool, fetchedAt };
        poolCache.set(pool.id, value);
        result.set(pool.id, value);
      }
    } catch (error) {
      if (!result.size) throw error;
      return { pools: result, failedItems: missing.length };
    }
  }
  return { pools: result, failedItems: 0 };
}

export function normalizeRaydiumPool(raw: RawEnrichmentEnvelope<RaydiumPool>): NormalizedEnrichmentRecord | null {
  const pool = raw.payload;
  if (pool.id !== raw.marketId || (pool.mintA.address !== raw.mint && pool.mintB.address !== raw.mint)) return null;
  const metrics: NormalizedEnrichmentRecord["metrics"] = [];
  const push = (key: string, label: string, value: number | undefined, unit: string, rawPath: string) => {
    if (value != null) metrics.push({ key, label, value, unit, rawPath });
  };
  push("tvl", "TVL", pool.tvl, "usd", "tvl");
  push("volume24h", "24h volume", pool.day?.volume, "usd", "day.volume");
  push("fees24h", "24h fees", pool.day?.volumeFee, "usd", "day.volumeFee");
  push("apr24h", "24h APR", pool.day?.apr, "percent", "day.apr");
  push("feeApr24h", "24h fee APR", pool.day?.feeApr, "percent", "day.feeApr");
  push("feeRate", "Fee rate", pool.feeRate, "percent", "feeRate");
  push("tickSpacing", "Tick spacing", pool.config?.tickSpacing, "count", "config.tickSpacing");
  return {
    provider: "Raydium",
    marketId: raw.marketId,
    mint: raw.mint,
    capability: "liquidity",
    metrics,
    sourceUrl: `${API_BASE}?ids=${encodeURIComponent(raw.marketId)}`,
    fetchedAt: raw.fetchedAt,
  };
}

function capabilityFromPool(context: AdapterContext, market: VenueMarket, value: CachedPool): CapabilityRecord | null {
  const normalized = normalizeRaydiumPool({
    provider: "Raydium", marketId: market.address, mint: context.mint, fetchedAt: value.fetchedAt, payload: value.pool,
  });
  if (!normalized) return null;
  const methodology = "Reported by Raydium for this exact Tokens.xyz market and variant mint";
  const pair = [value.pool.mintA.symbol, value.pool.mintB.symbol].filter(Boolean).join(" / ");
  return {
    id: `${context.mint}:liquidity:raydium:${market.address}`,
    assetId: context.assetId,
    mint: context.mint,
    kind: "liquidity",
    provider: "Raydium",
    providerCapability: value.pool.type,
    marketId: market.address,
    metrics: [
      ...(pair ? [{ key: "poolName", label: "Pool", value: pair, unit: "text" as const, methodology }] : []),
      { key: "poolType", label: "Pool type", value: value.pool.type, unit: "text", methodology },
      ...normalized.metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        value: metric.value,
        unit: metric.unit === "usd" ? "usd" as const : metric.unit === "percent" ? "percent" as const : "text" as const,
        methodology,
      })),
    ],
    evidence: {
      source: "Raydium",
      appUrl: raydiumAppUrl(market.address),
      sourceUrl: normalized.sourceUrl,
      observedAt: value.fetchedAt,
      fetchedAt: Date.now(),
      status: "active",
    },
  };
}

export async function raydiumCapabilities(context: AdapterContext): Promise<SourceResult<CapabilityRecord[]>> {
  const markets = (context.markets ?? []).filter(isRaydiumMarket);
  if (!markets.length) return sourceSuccess([]);
  try {
    const { pools, failedItems } = await fetchPools([...new Set(markets.map((market) => market.address))], context.signal);
    const records = markets.flatMap((market) => {
      const value = pools.get(market.address);
      const record = value && capabilityFromPool(context, market, value);
      return record ? [record] : [];
    });
    return failedItems ? sourcePartial(records, failedItems) : sourceSuccess(records);
  } catch (error) {
    return sourceFailure(error);
  }
}

export const raydiumAdapter: CapabilityAdapter = {
  id: "raydium",
  label: "Raydium",
  requiresMarkets: true,
  async discover() { return sourceSuccess([]); },
  capabilities: raydiumCapabilities,
};
