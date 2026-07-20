import { CapabilityKind, CapabilityRecord, SourceResult, VenueMarket } from "./types";

export const CAPABILITY_KINDS: CapabilityKind[] = ["trade", "liquidity", "earn", "borrow", "perpetuals", "rewards", "other"];

export function tokensMarketCapabilities(assetId: string, mint: string, markets: VenueMarket[], fetchedAt: number, status: "active" | "stale" = "active"): CapabilityRecord[] {
  return markets.filter((market) => Boolean(market.address)).map((market) => {
    const methodology = "Reported by Tokens.xyz for this exact market";
    const metrics: CapabilityRecord["metrics"] = [];
    if (market.price != null) metrics.push({ key: "price", label: "Price", value: market.price, unit: "usd", methodology });
    if (market.liquidity != null) metrics.push({ key: "liquidity", label: "Liquidity", value: market.liquidity, unit: "usd", methodology });
    if (market.volume24h != null) metrics.push({ key: "volume24h", label: "24h volume", value: market.volume24h, unit: "usd", methodology });
    if (market.trade24h != null) metrics.push({ key: "trade24h", label: "24h trades", value: market.trade24h, unit: "count", methodology });
    if (market.uniqueWallet24h != null) metrics.push({ key: "uniqueWallet24h", label: "24h wallets", value: market.uniqueWallet24h, unit: "count", methodology });
    const shared = {
      assetId, mint, provider: market.source ?? "Tokens.xyz market", marketId: market.address, metrics,
      evidence: { source: "Tokens.xyz", observedAt: fetchedAt, fetchedAt, status },
    };
    return {
      id: `${mint}:trade:tokens:${market.address}`,
      kind: "trade" as const,
      providerCapability: "market",
      ...shared,
    };
  });
}

export function visibleCapabilities(records: CapabilityRecord[]) {
  return records.filter((record) => record.evidence.status === "active" || record.evidence.status === "stale");
}

export type CapabilityBatch = { provider: string; result: SourceResult<CapabilityRecord[]> };

export function aggregateDisplayCapabilities({
  knownMints,
  batches,
  now,
  staleAfterMs = 15 * 60_000,
}: {
  knownMints: Iterable<string>;
  batches: CapabilityBatch[];
  now: number;
  staleAfterMs?: number;
}) {
  const known = new Set(knownMints);
  const accepted = new Map<string, CapabilityRecord>();
  const rejected: Array<{ provider: string; reason: "source_failed" | "unknown_mint" | "hidden_status" | "invalid_observation" }> = [];

  for (const batch of batches) {
    if (batch.result.status === "failed") {
      rejected.push({ provider: batch.provider, reason: "source_failed" });
      continue;
    }
    for (const record of batch.result.data) {
      if (!known.has(record.mint)) {
        rejected.push({ provider: batch.provider, reason: "unknown_mint" });
        continue;
      }
      if (!Number.isFinite(record.evidence.observedAt) || record.evidence.observedAt <= 0) {
        rejected.push({ provider: batch.provider, reason: "invalid_observation" });
        continue;
      }
      if (record.evidence.status === "unsupported" || record.evidence.status === "failed") {
        rejected.push({ provider: batch.provider, reason: "hidden_status" });
        continue;
      }
      const normalized = record.evidence.status === "active" && now - record.evidence.observedAt > staleAfterMs
        ? { ...record, evidence: { ...record.evidence, status: "stale" as const } }
        : record;
      accepted.set(normalized.id, normalized);
    }
  }

  return { capabilities: [...accepted.values()], rejected };
}
