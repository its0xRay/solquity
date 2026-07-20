import { z } from "zod";
import { CapabilityRecord, SourceResult } from "../types";
import { sourceFailure, sourceStale, sourceSuccess } from "../source-result";
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
type Snapshot = { matchesByMint: Map<string, KaminoMatch[]>; fetchedAt: number; complete: boolean };

let cached: Snapshot | null = null;
let refresh: Promise<Snapshot> | null = null;
let lastFailure: { error: unknown; at: number } | null = null;

async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000), next: { revalidate: 120 } });
  if (!response.ok) throw new Error(`Kamino returned ${response.status}`);
  return response.json();
}

async function fetchSnapshot(): Promise<Snapshot> {
  const markets = z.array(marketSchema).parse(await json(`${KAMINO_BASE}/v2/kamino-market`));
  const settled = await Promise.allSettled(markets.map(async (market) => ({
    market,
    reserves: z.array(reserveSchema).parse(await json(`${KAMINO_BASE}/kamino-market/${market.lendingMarket}/reserves/metrics`)),
  })));
  const reservesByMarket = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!reservesByMarket.length) throw new Error("Kamino reserve metrics unavailable");
  const matchesByMint = new Map<string, KaminoMatch[]>();
  for (const { market, reserves } of reservesByMarket) for (const reserve of reserves) {
    matchesByMint.set(reserve.liquidityTokenMint, [...(matchesByMint.get(reserve.liquidityTokenMint) ?? []), { market, reserve }]);
  }
  return { matchesByMint, fetchedAt: Date.now(), complete: reservesByMarket.length === markets.length };
}

async function snapshot(): Promise<{ value: Snapshot; stale: boolean }> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return { value: cached, stale: false };
  if (lastFailure && Date.now() - lastFailure.at < FAILURE_BACKOFF_MS) {
    if (cached) return { value: cached, stale: true };
    throw lastFailure.error;
  }
  try {
    refresh ??= fetchSnapshot();
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
      return stale ? sourceStale(found, value.fetchedAt, new Error("Kamino refresh failed")) : sourceSuccess(found, value.fetchedAt);
    } catch (error) { return sourceFailure(error); }
  },
  async capabilities(context): Promise<SourceResult<CapabilityRecord[]>> {
    try {
      const { value, stale } = await snapshot();
      const matches = value.matchesByMint.get(context.mint) ?? [];
      if (!matches.length && !value.complete) return sourceFailure(new Error("Kamino market scan incomplete"));
      const data = normalizeKaminoMatches(context, matches, value.fetchedAt, stale);
      return stale ? sourceStale(data, value.fetchedAt, new Error("Kamino refresh failed")) : sourceSuccess(data, value.fetchedAt);
    } catch (error) { return sourceFailure(error); }
  },
};

export { marketSchema as kaminoMarketSchema, reserveSchema as kaminoReserveSchema };
