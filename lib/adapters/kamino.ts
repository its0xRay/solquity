import { z } from "zod";
import { CapabilityRecord, SourceResult } from "../types";
import { sourceFailure, sourcePartial, sourceStale, sourceSuccess } from "../source-result";
import type { AdapterContext, CapabilityAdapter } from "./types";

const KAMINO_BASE = "https://api.kamino.finance";
const CACHE_MS = 120_000;
const FAILURE_BACKOFF_MS = 15_000;

const marketSchema = z.object({
  name: z.string(), lendingMarket: z.string(), isPrimary: z.boolean(), description: z.string(), isCurated: z.boolean(),
}).passthrough();

const reserveSchema = z.object({
  reserve: z.string(), liquidityToken: z.string(), liquidityTokenMint: z.string(), maxLtv: z.string(),
  borrowApy: z.string(), supplyApy: z.string(), totalSupply: z.string(), totalBorrow: z.string(),
  totalBorrowUsd: z.string(), totalSupplyUsd: z.string(),
}).passthrough();

type Market = z.infer<typeof marketSchema>;
type Reserve = z.infer<typeof reserveSchema>;
export type KaminoMatch = { market: Market; reserve: Reserve };
type Snapshot = { matchesByMint: Map<string, KaminoMatch[]>; fetchedAt: number; complete: boolean; failedMarkets: number };

let cached: Snapshot | null = null;
let refresh: Promise<Snapshot> | null = null;
let lastFailure: { error: unknown; at: number } | null = null;

// Both stages must fit inside the aggregator's eight-second adapter deadline.
// The signal covers response bodies too, not just response headers.
export async function fetchKaminoSnapshot(fetcher: typeof fetch = fetch, budgetMs = 6_000): Promise<Snapshot> {
  const scanSignal = AbortSignal.timeout(budgetMs);
  async function json(url: string) {
    scanSignal.throwIfAborted();
    const response = await fetcher(url, {
      signal: AbortSignal.any([scanSignal, AbortSignal.timeout(Math.min(3_000, budgetMs))]),
      next: { revalidate: 120 },
    });
    if (!response.ok) throw new Error(`Kamino returned ${response.status}`);
    return response.json();
  }
  const markets = z.array(marketSchema).parse(await json(`${KAMINO_BASE}/v2/kamino-market`));
  // Avoid a 48+ request burst. Check stock and primary markets first, without
  // excluding any market from coverage or assuming where a mint is listed.
  const queue = [...markets].sort((a, b) =>
    Number(b.isPrimary || /stock/i.test(b.name)) - Number(a.isPrimary || /stock/i.test(a.name)));
  const reservesByMarket: { market: Market; reserves: Reserve[] }[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (cursor < queue.length && !scanSignal.aborted) {
      const market = queue[cursor++];
      try {
        const reserves = z.array(reserveSchema).parse(await json(`${KAMINO_BASE}/kamino-market/${market.lendingMarket}/reserves/metrics`));
        reservesByMarket.push({ market, reserves });
      } catch { /* Failed or unvisited markets remain explicitly incomplete. */ }
    }
  }));
  if (!reservesByMarket.length) throw new Error("Kamino reserve metrics unavailable");
  const marketOrder = new Map(markets.map((market, index) => [market.lendingMarket, index]));
  reservesByMarket.sort((a, b) => marketOrder.get(a.market.lendingMarket)! - marketOrder.get(b.market.lendingMarket)!);
  const matchesByMint = new Map<string, KaminoMatch[]>();
  for (const { market, reserves } of reservesByMarket) for (const reserve of reserves) {
    matchesByMint.set(reserve.liquidityTokenMint, [...(matchesByMint.get(reserve.liquidityTokenMint) ?? []), { market, reserve }]);
  }
  const failedMarkets = markets.length - reservesByMarket.length;
  return { matchesByMint, fetchedAt: Date.now(), complete: failedMarkets === 0, failedMarkets };
}

async function snapshot(): Promise<{ value: Snapshot; stale: boolean }> {
  // Retry incomplete coverage promptly rather than hiding missing markets for two minutes.
  if (cached && Date.now() - cached.fetchedAt < (cached.complete ? CACHE_MS : FAILURE_BACKOFF_MS)) return { value: cached, stale: false };
  if (lastFailure && Date.now() - lastFailure.at < FAILURE_BACKOFF_MS) {
    if (cached) return { value: cached, stale: true };
    throw lastFailure.error;
  }
  try {
    refresh ??= fetchKaminoSnapshot();
    cached = await refresh;
    lastFailure = null;
    return { value: cached, stale: false };
  } catch (error) {
    lastFailure = { error, at: Date.now() };
    if (cached) return { value: cached, stale: true };
    throw error;
  } finally {
    refresh = null;
  }
}

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function kaminoBorrowUrl(symbol: string) {
  const search = symbol.trim();
  return search ? `https://kamino.com/borrow?search=${encodeURIComponent(search)}` : "https://kamino.com/borrow";
}

export function normalizeKaminoMatches(context: AdapterContext, matches: KaminoMatch[], observedAt: number, stale = false): CapabilityRecord[] {
  return matches.flatMap(({ market, reserve }) => {
    if (reserve.liquidityTokenMint !== context.mint) return [];
    const methodology = "Reported by Kamino for this exact reserve mint";
    const rawMaxLtv = numeric(reserve.maxLtv);
    const maxLtv = rawMaxLtv != null && rawMaxLtv >= 0 && rawMaxLtv <= 1 ? rawMaxLtv : null;
    const identityMetrics: CapabilityRecord["metrics"] = [
      { key: "marketName", label: "Market", value: market.name, unit: "text", methodology },
      { key: "reserve", label: "Reserve", value: reserve.reserve, unit: "text", methodology },
    ];
    const earnMetrics: CapabilityRecord["metrics"] = [
      ...identityMetrics,
      { key: "supplyApy", label: "Supply APY", value: numeric(reserve.supplyApy) ?? reserve.supplyApy, unit: "ratio", methodology },
      { key: "borrowApy", label: "Borrow APY", value: numeric(reserve.borrowApy) ?? reserve.borrowApy, unit: "ratio", methodology },
      { key: "totalSupplyUsd", label: "Total supplied", value: numeric(reserve.totalSupplyUsd) ?? reserve.totalSupplyUsd, unit: "usd", methodology },
      { key: "totalBorrowUsd", label: "Total borrowed", value: numeric(reserve.totalBorrowUsd) ?? reserve.totalBorrowUsd, unit: "usd", methodology },
    ];
    const collateralMetrics: CapabilityRecord["metrics"] = [
      ...identityMetrics,
      ...(maxLtv != null ? [{ key: "maxLtv", label: "Max LTV", value: maxLtv, unit: "ratio" as const, methodology }] : []),
      { key: "totalSupplyUsd", label: "Total supplied", value: numeric(reserve.totalSupplyUsd) ?? reserve.totalSupplyUsd, unit: "usd", methodology },
    ];
    const evidence = {
      source: "Kamino", appUrl: kaminoBorrowUrl(reserve.liquidityToken),
      sourceUrl: `${KAMINO_BASE}/kamino-market/${market.lendingMarket}/reserves/metrics`,
      observedAt, fetchedAt: Date.now(), status: stale ? "stale" as const : "active" as const,
    };
    const earn: CapabilityRecord = {
      id: `${context.mint}:earn:kamino:${reserve.reserve}`, assetId: context.assetId, mint: context.mint,
      kind: "earn", provider: "Kamino", providerCapability: "lending_reserve", marketId: market.lendingMarket,
      metrics: earnMetrics, evidence,
    };
    const borrow: CapabilityRecord[] = maxLtv != null && maxLtv > 0 ? [{
      id: `${context.mint}:borrow:kamino:${reserve.reserve}`, assetId: context.assetId, mint: context.mint,
      kind: "borrow", provider: "Kamino", providerCapability: "collateral_reserve", marketId: market.lendingMarket,
      metrics: collateralMetrics, evidence,
    }] : [];
    return [earn, ...borrow];
  });
}

export const kaminoAdapter: CapabilityAdapter = {
  id: "kamino",
  label: "Kamino",
  async discover(mints) {
    try {
      const { value, stale } = await snapshot();
      const found = mints.filter((mint) => value.matchesByMint.has(mint));
      if (!found.length && !value.complete) return sourceFailure(new Error("Kamino market scan incomplete"));
      return stale ? sourceStale(found, value.fetchedAt, new Error("Kamino refresh failed"))
        : value.complete ? sourceSuccess(found, value.fetchedAt) : sourcePartial(found, value.failedMarkets, value.fetchedAt);
    } catch (error) { return sourceFailure(error); }
  },
  async capabilities(context): Promise<SourceResult<CapabilityRecord[]>> {
    try {
      const { value, stale } = await snapshot();
      const matches = value.matchesByMint.get(context.mint) ?? [];
      if (!matches.length && !value.complete) return sourceFailure(new Error("Kamino market scan incomplete"));
      const data = normalizeKaminoMatches(context, matches, value.fetchedAt, stale);
      return stale ? sourceStale(data, value.fetchedAt, new Error("Kamino refresh failed"))
        : value.complete ? sourceSuccess(data, value.fetchedAt) : sourcePartial(data, value.failedMarkets, value.fetchedAt);
    } catch (error) { return sourceFailure(error); }
  },
};

export { marketSchema as kaminoMarketSchema, reserveSchema as kaminoReserveSchema };
