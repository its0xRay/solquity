import acceptance from "../reports/capability-acceptance.json";
import type { Asset } from "./types";

export type VisibleCapabilityKind = "trade" | "earn" | "borrow" | "liquidity";
export type CapabilityCoverage = Record<string, VisibleCapabilityKind[]>;
export type CapabilityCoverageIndex = {
  byAsset: CapabilityCoverage;
  byMint: CapabilityCoverage;
  mintsByAsset: Record<string, string[]>;
};
type AcceptanceArtifact = {
  summary?: { generatedAt?: string };
  assets: Array<{ assetId: string; capabilities: string[] }>;
  variants: Array<{ assetId: string; mint: string; capabilities: string[] }>;
};

const visibleKinds = new Set<VisibleCapabilityKind>(["trade", "earn", "borrow", "liquidity"]);
const kindOrder: VisibleCapabilityKind[] = ["trade", "earn", "borrow", "liquidity"];

function orderedVisibleKinds(kinds: string[]) {
  return kinds
    .filter((kind): kind is VisibleCapabilityKind => visibleKinds.has(kind as VisibleCapabilityKind))
    .sort((a, b) => kindOrder.indexOf(a) - kindOrder.indexOf(b));
}

export function buildCapabilityCoverage(source: AcceptanceArtifact): CapabilityCoverageIndex {
  const byAsset = Object.fromEntries(source.assets.map((asset) => [
    asset.assetId,
    orderedVisibleKinds(asset.capabilities),
  ]));
  const byMint = Object.fromEntries(source.variants.map((variant) => [
    variant.mint,
    orderedVisibleKinds(variant.capabilities),
  ]));
  const mintsByAsset = Object.fromEntries(source.assets.map((asset) => [
    asset.assetId,
    source.variants.filter((variant) => variant.assetId === asset.assetId).map((variant) => variant.mint),
  ]));
  return { byAsset, byMint, mintsByAsset };
}

export function getCapabilityCoverage(): CapabilityCoverageIndex {
  return buildCapabilityCoverage(acceptance);
}

export function capabilityAcceptanceGeneratedAt() {
  return acceptance.summary.generatedAt;
}

export function preferredCapabilityMint(asset: Asset, coverage: CapabilityCoverageIndex) {
  const mints = coverage.mintsByAsset[asset.assetId] ?? [];
  const mostCapabilities = Math.max(0, ...mints.map((mint) => coverage.byMint[mint]?.length ?? 0));
  const candidates = mints.filter((mint) => (coverage.byMint[mint]?.length ?? 0) === mostCapabilities);
  return asset.primaryVariant?.mint && candidates.includes(asset.primaryVariant.mint)
    ? asset.primaryVariant.mint
    : candidates.sort().at(0) ?? asset.primaryVariant?.mint;
}

export function capabilityLedAssets(assets: Asset[], coverage: CapabilityCoverageIndex, limit = 6) {
  return [...assets]
    .filter((asset) => Math.max(0, ...(coverage.mintsByAsset[asset.assetId] ?? []).map((mint) => coverage.byMint[mint]?.length ?? 0)) > 1)
    .sort((a, b) =>
      Math.max(0, ...(coverage.mintsByAsset[b.assetId] ?? []).map((mint) => coverage.byMint[mint]?.length ?? 0))
      - Math.max(0, ...(coverage.mintsByAsset[a.assetId] ?? []).map((mint) => coverage.byMint[mint]?.length ?? 0))
      || (b.stats?.liquidity ?? -1) - (a.stats?.liquidity ?? -1)
      || (a.name ?? a.assetId).localeCompare(b.name ?? b.assetId))
    .slice(0, limit);
}

export function featuredAssets(assets: Asset[], coverage: CapabilityCoverageIndex) {
  const capabilityRanked = capabilityLedAssets(assets, coverage, assets.length);
  const liquidityRanked = [...assets]
    .filter((asset) =>
      (asset.category === "equity" || asset.category === "etf")
      && typeof asset.stats?.liquidity === "number"
      && Number.isFinite(asset.stats.liquidity))
    .sort((a, b) =>
      (b.stats?.liquidity ?? 0) - (a.stats?.liquidity ?? 0)
      || (a.name ?? a.assetId).localeCompare(b.name ?? b.assetId));

  const selectedIds = new Set<string>();
  const selected: Asset[] = [];
  const take = (ranked: Asset[]) => {
    let added = 0;
    for (const asset of ranked) {
      if (selectedIds.has(asset.assetId)) continue;
      selected.push(asset);
      selectedIds.add(asset.assetId);
      added += 1;
      if (added === 3) break;
    }
  };

  take(capabilityRanked);
  take(liquidityRanked);
  take(capabilityRanked);
  take(liquidityRanked);

  return selected.slice(0, 12);
}

export function defaultCapabilityAsset(assets: Asset[], coverage: CapabilityCoverageIndex) {
  const candidates = capabilityLedAssets(assets, coverage, assets.length);
  return candidates.find((asset) => asset.category === "equity") ?? candidates[0] ?? assets[0];
}
