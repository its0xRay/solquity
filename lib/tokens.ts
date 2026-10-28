import { Asset, AssetAuditDetail, AssetDetail, PriceCandle, RiskSummary, SourceResult, Variant, VariantDescription, VenueMarket } from "./types";
import { tokensFetch } from "./tokens-client";
import { aggregateDisplayCapabilities, tokensMarketCapabilities } from "./capabilities";
import { sourceFailure, sourceStale, sourceSuccess } from "./source-result";
import { isVenueEligible } from "./venue-status";
import { assetMembers, canonicalAssetId, groupAssets, normalizeAsset, normalizeVariant, securityGroup } from "./asset-identity";
import {
  curatedResponseSchema, descriptionResponseSchema, detailResponseSchema, detailWithMarketsResponseSchema,
  priceChartResponseSchema, riskResponseSchema, searchResponseSchema, variantsResponseSchema,
} from "./tokens-schemas";

const DAY = 86_400;
const METRICS = 120;
const PAGE_SIZE = 250;
const MARKET_PAGE_SIZE = 50;
const MAX_MARKET_PAGES = 50;

type CachedValue<T> = { data: T; observedAt: number };
const lastGoodMarkets = new Map<string, CachedValue<VenueMarket[]>>();
const lastGoodRisk = new Map<string, CachedValue<RiskSummary>>();
const lastGoodRiskDetails = new Map<string, CachedValue<RiskSummary>>();
const lastGoodDescriptions = new Map<string, CachedValue<VariantDescription>>();
const lastGoodCharts = new Map<string, CachedValue<PriceCandle[]>>();
const inFlightSources = new WeakMap<object, Map<string, Promise<SourceResult<unknown>>>>();

function cacheKey(assetId: string, mint: string) { return `${assetId}:${mint}`; }

async function withLastGood<T>(key: string, cache: Map<string, CachedValue<T>>, request: () => Promise<T>): Promise<SourceResult<T>> {
  const previous = cache.get(key);
  if (previous && Date.now() - previous.observedAt < METRICS * 1000) return sourceSuccess(previous.data,previous.observedAt);
  let pending = inFlightSources.get(cache);
  if (!pending) { pending = new Map(); inFlightSources.set(cache,pending); }
  const existing = pending.get(key);
  if (existing) return existing as Promise<SourceResult<T>>;
  const refresh = (async () => {
    try {
      const data = await request();
      const observedAt = Date.now();
      cache.set(key, { data, observedAt });
      return sourceSuccess(data, observedAt);
    } catch (error) {
      return previous ? sourceStale(previous.data, previous.observedAt, error) : sourceFailure<T>(error);
    }
  })().finally(() => pending!.delete(key));
  pending.set(key,refresh);
  return refresh;
}

async function getCuratedList(list: "stocks" | "etfs") {
  const assets: Asset[] = [];
  let offset = 0;
  do {
    const response = await tokensFetch(
      `/assets/curated?list=${list}&limit=${PAGE_SIZE}&offset=${offset}&variantsMode=all`,
      curatedResponseSchema,
      { revalidate: DAY },
    );
    assets.push(...response.assets as Asset[]);
    const next = response.pagination?.nextOffset;
    if (next == null || next <= offset) break;
    offset = next;
  } while (true);
  return assets;
}

export async function getUniverse(): Promise<Asset[]> {
  const [stocks, etfs] = await Promise.all([getCuratedList("stocks"), getCuratedList("etfs")]);
  const unique = new Map<string, Asset>();
  for (const asset of [...stocks, ...etfs]) unique.set(asset.assetId, asset);
  return groupAssets([...unique.values()]).sort((a, b) =>
    (b.stats?.liquidity ?? -1) - (a.stats?.liquidity ?? -1) || (a.name ?? a.assetId).localeCompare(b.name ?? b.assetId));
}

export async function searchUniverse(query: string): Promise<Asset[]> {
  const q = query.trim();
  if (!q) return [];
  const [equities, etfs] = await Promise.all(["equity", "etf"].map((category) => tokensFetch(
    `/assets/search?q=${encodeURIComponent(q)}&category=${category}&limit=8`, searchResponseSchema, { revalidate: METRICS },
  )));
  const unique = new Map<string, Asset>();
  const interleaved = Array.from({ length: Math.max(equities.results.length, etfs.results.length) }, (_, index) => [
    equities.results[index], etfs.results[index],
  ]).flat().filter(Boolean) as Asset[];
  for (const asset of interleaved) unique.set(asset.assetId, asset);
  return groupAssets([...unique.values()]).slice(0, 8);
}

export async function getVariantMints(assetId: string): Promise<string[]> {
  const data = await Promise.all(assetMembers(assetId).map(id => tokensFetch(`/assets/${encodeURIComponent(id)}/variants?variantsMode=all&sortBy=liquidity`, variantsResponseSchema, { revalidate: DAY })));
  return [...new Set(data.flatMap(item => item.variants.map(variant => variant.mint)))];
}

async function getAllMarkets(assetId: string, mint: string): Promise<VenueMarket[]> {
  const markets: VenueMarket[] = [];
  let offset = 0;
  let pageCount = 0;
  do {
    pageCount += 1;
    if (pageCount > MAX_MARKET_PAGES) throw new Error("Tokens markets pagination exceeded the safety limit");
    const response = await tokensFetch(
      `/assets/${encodeURIComponent(assetId)}?include=markets&mint=${encodeURIComponent(mint)}&marketsOffset=${offset}&marketsLimit=${MARKET_PAGE_SIZE}`,
      detailWithMarketsResponseSchema,
      { revalidate: METRICS },
    );
    const included = response.includes.markets;
    if (!included?.ok) throw new Error("Tokens markets include was unavailable");
    const page = included.data.markets as VenueMarket[];
    markets.push(...page);
    const total = included.data.total;
    if (!page.length || total != null && markets.length >= total || total == null && page.length < MARKET_PAGE_SIZE) break;
    offset += page.length;
  } while (true);
  return markets;
}

export async function getVariantMarkets(assetId: string, mint: string): Promise<SourceResult<VenueMarket[]>> {
  const sourceId = securityGroup(assetId) ? (await getAssetOverview(assetId)).variants.find(item => item.mint === mint)?.sourceAssetId ?? assetId : assetId;
  return withLastGood(cacheKey(sourceId, mint), lastGoodMarkets, () => getAllMarkets(sourceId, mint));
}

export async function getAssetOverview(assetId: string): Promise<AssetDetail> {
  const id = canonicalAssetId(assetId);
  const entries = await Promise.all(assetMembers(assetId).map(async sourceId => {
  const [detail, variantData] = await Promise.all([
    tokensFetch(`/assets/${encodeURIComponent(sourceId)}?include=profile&variantsMode=all&primaryVariantStrategy=liquidity`, detailResponseSchema, { revalidate: DAY }),
    tokensFetch(`/assets/${encodeURIComponent(sourceId)}/variants?variantsMode=all&sortBy=liquidity`, variantsResponseSchema, { revalidate: METRICS }),
  ]);
    return {asset:normalizeAsset(detail.asset as Asset),variants:variantData.variants.map(variant => normalizeVariant(variant as Variant,sourceId))};
  }));
  const asset = entries[assetMembers(assetId).indexOf(assetId)]?.asset ?? entries.find(entry => entry.asset.assetId === id)?.asset ?? entries[0].asset;
  const variants = [...new Map(entries.flatMap(entry => entry.variants).map(variant => [variant.mint,variant])).values()];
  return { asset:{...asset,variants}, variants, marketResultsByMint: {}, displayMarketsByMint: {}, displayCapabilitiesByMint: {}, riskResultsByMint: {}, fetchedAt: Date.now() };
}

export async function getVariantRisk(assetId: string, mint: string) {
  const sourceId = securityGroup(assetId) ? (await getAssetOverview(assetId)).variants.find(item => item.mint === mint)?.sourceAssetId ?? assetId : assetId;
  return withLastGood(cacheKey(assetId, mint), lastGoodRisk, () => tokensFetch(
    `/assets/${encodeURIComponent(sourceId)}/risk-summary?mint=${encodeURIComponent(mint)}`, riskResponseSchema, { revalidate: METRICS },
  ) as Promise<RiskSummary>);
}

export async function getAssetDetail(assetId: string, options: { mint?: string; includeRisk?: boolean } = {}): Promise<AssetDetail> {
  const overview = await getAssetOverview(assetId);
  const variants = options.mint ? overview.variants.filter(variant => variant.mint === options.mint) : overview.variants;
  if (options.mint && !variants.length) throw new Error("Mint does not belong to this asset");
  const [marketEntries, riskEntries] = await Promise.all([
    Promise.all(variants.map(async (variant) => [
      variant.mint,
      await getVariantMarkets(assetId, variant.mint),
    ] as const)),
    Promise.all((options.includeRisk === false ? [] : variants).map(async (variant) => [
      variant.mint,
      await getVariantRisk(assetId, variant.mint),
    ] as const)),
  ]);

  const marketResultsByMint = Object.fromEntries(marketEntries);
  const displayMarketsByMint = Object.fromEntries(variants.map((variant) => {
    const result = marketResultsByMint[variant.mint];
    return [variant.mint, result && result.status !== "failed" ? result.data.filter(isVenueEligible) : []];
  }));
  const fetchedAt = Date.now();
  const displayCapabilitiesByMint = Object.fromEntries(variants.map((variant) => {
    const marketResult = marketResultsByMint[variant.mint];
    const capabilityResult = marketResult && marketResult.status !== "failed"
      ? sourceSuccess(tokensMarketCapabilities(
        assetId,
        variant.mint,
        displayMarketsByMint[variant.mint],
        marketResult.status === "stale" ? marketResult.observedAt : marketResult.fetchedAt,
        marketResult.status === "stale" ? "stale" : "active",
      ), marketResult.fetchedAt)
      : sourceFailure<ReturnType<typeof tokensMarketCapabilities>>(new Error(marketResult?.error.message ?? "Market source unavailable"), fetchedAt);
    return [variant.mint, aggregateDisplayCapabilities({
      knownMints: variants.map((item) => item.mint), batches: [{ provider: "Tokens.xyz", result: capabilityResult }], now: fetchedAt,
    }).capabilities];
  }));

  return {
    asset: overview.asset,
    variants: overview.variants,
    marketResultsByMint,
    displayMarketsByMint,
    displayCapabilitiesByMint,
    riskResultsByMint: Object.fromEntries(riskEntries),
    fetchedAt,
  };
}

export async function getAssetAuditDetail(assetId: string): Promise<AssetAuditDetail> {
  const [detail, chartResult] = await Promise.all([
    getAssetDetail(assetId),
    withLastGood(assetId, lastGoodCharts, async () => {
      const data = await tokensFetch(`/assets/${encodeURIComponent(assetId)}/price-chart?interval=1D`, priceChartResponseSchema, { revalidate: METRICS });
      return (data.candles ?? []) as PriceCandle[];
    }),
  ]);
  const [riskDetailEntries, descriptionEntries] = await Promise.all([
    Promise.all(detail.variants.map(async (variant) => [
      variant.mint,
      await withLastGood(cacheKey(assetId, variant.mint), lastGoodRiskDetails, () => tokensFetch(
        `/assets/${encodeURIComponent(assetId)}/risk-details?mint=${encodeURIComponent(variant.mint)}`, riskResponseSchema, { revalidate: METRICS },
      ) as Promise<RiskSummary>),
    ] as const)),
    Promise.all(detail.variants.map(async (variant) => [
      variant.mint,
      await withLastGood(cacheKey(assetId, variant.mint), lastGoodDescriptions, () => tokensFetch(
        `/assets/${encodeURIComponent(assetId)}/description?mint=${encodeURIComponent(variant.mint)}`, descriptionResponseSchema, { revalidate: DAY },
      ) as Promise<VariantDescription>),
    ] as const)),
  ]);
  return {
    ...detail,
    riskDetailResultsByMint: Object.fromEntries(riskDetailEntries),
    descriptionResultsByMint: Object.fromEntries(descriptionEntries),
    chartResult,
  };
}
