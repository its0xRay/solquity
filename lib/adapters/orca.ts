import { z } from "zod";
import { NormalizedEnrichmentRecord, RawEnrichmentEnvelope } from "../enrichment";
import { sourceFailure, sourcePartial, sourceSuccess } from "../source-result";
import { abortableDelay, requestSignal } from "../request-signal";
import type { CapabilityRecord, SourceResult, VenueMarket } from "../types";
import type { AdapterContext, CapabilityAdapter } from "./types";

const CACHE_MS = 60_000;
const API_BASE = "https://api.orca.so/v2/solana/pools";
const MIN_REQUEST_INTERVAL_MS = 350;
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

const numericString = z.string().refine((value) => Number.isFinite(Number(value)), "Expected a numeric string");
const nullableNumericString = numericString.nullable().optional();
const periodSchema = z.object({
  volume: nullableNumericString,
  fees: nullableNumericString,
  rewards: nullableNumericString,
  yieldOverTvl: nullableNumericString,
}).passthrough();

export const orcaPoolSchema = z.object({
  address: z.string(),
  tokenMintA: z.string(),
  tokenMintB: z.string(),
  tokenA: z.object({ address: z.string(), symbol: z.string().nullable().optional() }).passthrough(),
  tokenB: z.object({ address: z.string(), symbol: z.string().nullable().optional() }).passthrough(),
  poolType: z.enum(["splashpool", "whirlpool"]),
  tickSpacing: z.number(),
  feeRate: z.number(),
  tvlUsdc: numericString,
  hasWarning: z.boolean(),
  stats: z.record(z.string(), periodSchema),
  updatedAt: z.string(),
  updatedSlot: z.number(),
}).passthrough();

export const orcaPoolResponseSchema = z.object({ data: orcaPoolSchema }).passthrough();
export const orcaPoolsResponseSchema = z.object({ data: z.array(orcaPoolSchema) }).passthrough();
export type OrcaPool = z.infer<typeof orcaPoolSchema>;
type CachedPool = { pool: OrcaPool; fetchedAt: number };
const poolCache = new Map<string, CachedPool>();
let requestQueue = Promise.resolve();
let nextRequestAt = 0;

function isOrcaMarket(market: VenueMarket) {
  return /^orca(?: |$)/i.test(market.source ?? "") && Boolean(market.address);
}

export function orcaAppUrl(address: string) {
  return `https://www.orca.so/pools/${encodeURIComponent(address)}`;
}

export function orcaPoolUrl(address: string) {
  return `${API_BASE}/${encodeURIComponent(address)}?stats=24h`;
}

async function scheduledRequest(address: string, signal?: AbortSignal) {
  const preceding = requestQueue;
  let release: () => void = () => {};
  requestQueue = new Promise<void>((resolve) => { release = resolve; });
  await preceding;
  try {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await abortableDelay(wait, signal);
    return await fetch(orcaPoolUrl(address), {
      signal: requestSignal(signal, 12_000), next: { revalidate: 60 },
    });
  } finally {
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    release();
  }
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : RETRY_DELAYS_MS[attempt];
}

async function fetchPool(address: string, signal?: AbortSignal): Promise<CachedPool | null> {
  const cached = poolCache.get(address);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await scheduledRequest(address, signal);
    if (response.status === 404) return null;
    if (response.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      await abortableDelay(retryDelay(response, attempt), signal);
      continue;
    }
    if (!response.ok) throw new Error(`Orca returned ${response.status}`);
    const pool = orcaPoolResponseSchema.parse(await response.json()).data;
    const value = { pool, fetchedAt: Date.now() };
    poolCache.set(address, value);
    return value;
  }
  throw new Error("Orca rate limit persisted after retries");
}

function numberFrom(value: string | null | undefined) {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeOrcaPool(raw: RawEnrichmentEnvelope<OrcaPool>): NormalizedEnrichmentRecord | null {
  const pool = raw.payload;
  if (pool.address !== raw.marketId || (pool.tokenMintA !== raw.mint && pool.tokenMintB !== raw.mint)) return null;
  const metrics: NormalizedEnrichmentRecord["metrics"] = [];
  const push = (key: string, label: string, value: number | undefined, unit: string, rawPath: string) => {
    if (value != null) metrics.push({ key, label, value, unit, rawPath });
  };
  push("tvl", "TVL", numberFrom(pool.tvlUsdc), "usd", "tvlUsdc");
  push("volume24h", "24h volume", numberFrom(pool.stats["24h"]?.volume), "usd", "stats.24h.volume");
  push("fees24h", "24h fees", numberFrom(pool.stats["24h"]?.fees), "usd", "stats.24h.fees");
  push("tickSpacing", "Tick spacing", pool.tickSpacing, "count", "tickSpacing");
  push("feeRateRaw", "Fee rate", pool.feeRate, "count", "feeRate");
  metrics.push({ key: "hasWarning", label: "Orca warning flag", value: pool.hasWarning ? "true" : "false", unit: "text", rawPath: "hasWarning" });
  return {
    provider: "Orca",
    marketId: raw.marketId,
    mint: raw.mint,
    capability: "liquidity",
    metrics,
    sourceUrl: `${API_BASE}/${encodeURIComponent(raw.marketId)}`,
    fetchedAt: raw.fetchedAt,
  };
}

function capabilityFromPool(context: AdapterContext, market: VenueMarket, value: CachedPool): CapabilityRecord | null {
  const normalized = normalizeOrcaPool({
    provider: "Orca", marketId: market.address, mint: context.mint, fetchedAt: value.fetchedAt, payload: value.pool,
  });
  if (!normalized) return null;
  const methodology = "Reported by Orca for this exact Tokens.xyz market and variant mint";
  const pair = [value.pool.tokenA.symbol, value.pool.tokenB.symbol].filter(Boolean).join(" / ");
  const providerObservedAt = Date.parse(value.pool.updatedAt);
  return {
    id: `${context.mint}:liquidity:orca:${market.address}`,
    assetId: context.assetId,
    mint: context.mint,
    kind: "liquidity",
    provider: "Orca",
    providerCapability: value.pool.poolType,
    marketId: market.address,
    metrics: [
      ...(pair ? [{ key: "poolName", label: "Pool", value: pair, unit: "text" as const, methodology }] : []),
      { key: "poolType", label: "Pool type", value: value.pool.poolType === "splashpool" ? "Splash Pool" : "Whirlpool", unit: "text", methodology },
      ...normalized.metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        value: metric.value,
        unit: metric.unit === "usd" ? "usd" as const : "text" as const,
        methodology,
      })),
    ],
    evidence: {
      source: "Orca",
      appUrl: orcaAppUrl(market.address),
      sourceUrl: normalized.sourceUrl,
      observedAt: Number.isFinite(providerObservedAt) ? providerObservedAt : value.fetchedAt,
      fetchedAt: value.fetchedAt,
      status: "active",
    },
  };
}

export async function orcaCapabilities(context: AdapterContext): Promise<SourceResult<CapabilityRecord[]>> {
  const markets = (context.markets ?? []).filter(isOrcaMarket);
  if (!markets.length) return sourceSuccess([]);
  const settled = await Promise.allSettled(markets.map(async (market) => {
    const value = await fetchPool(market.address, context.signal);
    return value ? capabilityFromPool(context, market, value) : null;
  }));
  const records = settled.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  const failedItems = settled.filter((result) => result.status === "rejected").length;
  if (!records.length && failedItems) return sourceFailure(new Error("Orca pool details unavailable"));
  if (failedItems) return sourcePartial(records, failedItems);
  return sourceSuccess(records);
}

export const orcaAdapter: CapabilityAdapter = {
  id: "orca",
  label: "Orca",
  requiresMarkets: true,
  async discover() { return sourceSuccess([]); },
  capabilities: orcaCapabilities,
};
