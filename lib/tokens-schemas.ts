import { z } from "zod";

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const marketSnapshotSchema = z.object({
  price: nullableNumber,
  liquidity: nullableNumber,
  volume24hUSD: nullableNumber,
  trade24h: nullableNumber,
  uniqueWallet24h: nullableNumber,
  priceChange24hPercent: nullableNumber,
  lastTradeAt: nullableNumber,
  asOf: nullableNumber,
  lastFetchedAt: nullableNumber,
  logoURI: z.string().nullable().optional(),
}).passthrough();

export const executionQualitySchema = z.object({
  executionScore: nullableNumber,
  feeBps: nullableNumber,
  flowSourceCount: nullableNumber,
  botVolumeRatio: nullableNumber,
  isEligibleForPrimary: z.boolean().optional(),
  asOf: nullableNumber,
  lastComputedAt: nullableNumber,
}).passthrough();

export const variantSchema = z.object({
  variantId: z.string(), mint: z.string().min(32), kind: z.string(), issuer: z.string().optional(), issuerUrl: z.string().optional(),
  label: z.string().optional(), stockVariantTier: z.enum(["share_redeemable", "cash_redeemable", "not_redeemable"]).optional(),
  symbol: z.string().optional(), name: z.string().optional(), liquidityTier: z.string().optional(), market: marketSnapshotSchema.nullable().optional(),
  executionQuality: executionQualitySchema.nullable().optional(),
}).passthrough();

const assetStatsSchema = z.object({
  price: nullableNumber, liquidity: nullableNumber, volume24hUSD: nullableNumber,
  volume30dUSD: nullableNumber, priceChange24hPercent: nullableNumber,
}).passthrough();

const canonicalMarketSchema = z.object({
  source: z.string().optional(), price: nullableNumber, priceChange24hPercent: nullableNumber,
  asOf: nullableNumber, lastFetchedAt: nullableNumber,
}).passthrough();

export const assetSchema = z.object({
  assetId: z.string(), name: z.string().optional(), symbol: z.string().optional(), category: z.string(), imageUrl: z.string().nullable().optional(),
  description: nullableString, stats: assetStatsSchema.nullable().optional(), canonicalMarket: canonicalMarketSchema.nullable().optional(),
  primaryVariant: variantSchema.nullable().optional(), variants: z.array(variantSchema).optional(),
}).passthrough();

export const curatedResponseSchema = z.object({ assets: z.array(assetSchema), pagination: z.object({ nextOffset: z.number().nullable().optional() }).optional() }).passthrough();
export const searchResponseSchema = z.object({ query: z.string(), category: z.string().nullable().optional(), results: z.array(assetSchema) }).passthrough();
export const detailResponseSchema = z.object({ asset: assetSchema }).passthrough();
export const variantsResponseSchema = z.object({ variants: z.array(variantSchema) }).passthrough();
export const venueMarketSchema = z.object({
  address: z.string(), name: z.string().optional(), source: z.string().optional(),
  liquidity: nullableNumber, price: nullableNumber, volume24h: nullableNumber,
  trade24h: nullableNumber, uniqueWallet24h: nullableNumber,
  base: z.object({ address: z.string().optional(), symbol: z.string().optional(), icon: z.string().optional() }).optional(),
  quote: z.object({ address: z.string().optional(), symbol: z.string().optional(), icon: z.string().optional() }).optional(),
}).passthrough();
export const includedMarketsSchema = z.object({
  ok: z.boolean(), data: z.object({
    markets: z.array(venueMarketSchema), total: z.number().optional(), offset: z.number().optional(), limit: z.number().optional(), lastUpdatedAt: nullableNumber,
  }).passthrough(),
}).passthrough();
export const detailWithMarketsResponseSchema = z.object({ asset: assetSchema, includes: z.object({ markets: includedMarketsSchema.optional() }).passthrough() }).passthrough();
export const priceChartResponseSchema = z.object({ candles: z.array(z.object({ time: z.number() }).passthrough()).optional() }).passthrough();
const riskComponentSchema = z.object({ score: nullableNumber, status: z.string().optional(), hasData: z.boolean().optional() }).passthrough();
const marketScoreSchema = z.object({
  score: nullableNumber, grade: nullableString, label: nullableString, tone: nullableString,
  caps: z.array(z.string()).optional(), borderlineSignals: z.array(z.string()).optional(),
  hasInsufficientData: z.boolean().optional(), insufficientDataReason: nullableString,
  components: z.record(z.string(), riskComponentSchema).optional(),
}).passthrough();
export const riskResponseSchema = z.object({ assetId: z.string().optional(), mint: z.string().optional(), risk: z.object({
  ok: z.boolean().optional(), marketScore: marketScoreSchema.nullable().optional(),
  marketScoreInput: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).nullable().optional(),
  lastUpdatedAt: nullableNumber,
}).passthrough().nullable().optional() }).passthrough();
export const descriptionResponseSchema = z.object({ assetId: z.string(), mint: z.string(), description: z.string().nullable() }).passthrough();
