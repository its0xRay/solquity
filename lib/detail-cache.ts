import { AssetDetail } from "./types";

export const COMPLETE_DETAIL_TTL_MS = 2 * 60_000;
export const PARTIAL_DETAIL_TTL_MS = 15_000;

export type DetailCacheEntry = { detail: AssetDetail; cachedAt: number };

export function hasPartialSourceFailure(detail: AssetDetail) {
  return Object.values(detail.marketResultsByMint).some((result) => result.status !== "success")
    || Object.values(detail.riskResultsByMint).some((result) => result.status !== "success");
}

export function isDetailCacheFresh(entry: DetailCacheEntry, now = Date.now()) {
  const ttl = hasPartialSourceFailure(entry.detail) ? PARTIAL_DETAIL_TTL_MS : COMPLETE_DETAIL_TTL_MS;
  return now - entry.cachedAt < ttl;
}
