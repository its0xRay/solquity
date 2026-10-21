import type { AssetDetail, ProtocolCapabilityResponse } from "./types";
import { PROTOCOL_CAPABILITY_TTL_MS } from "./protocol-cache";

export function mergeAssetDetail(previous: AssetDetail, next: AssetDetail): AssetDetail {
  if (previous.asset.assetId !== next.asset.assetId) return next;
  return {...previous, ...next,
    marketResultsByMint:{...previous.marketResultsByMint,...next.marketResultsByMint},
    displayMarketsByMint:{...previous.displayMarketsByMint,...next.displayMarketsByMint},
    displayCapabilitiesByMint:{...previous.displayCapabilitiesByMint,...next.displayCapabilitiesByMint},
    riskResultsByMint:{...previous.riskResultsByMint,...next.riskResultsByMint}};
}
export function mergeProtocolResponse(previous: ProtocolCapabilityResponse | undefined, next: ProtocolCapabilityResponse): ProtocolCapabilityResponse {
  if (!previous) return next;
  const updated = new Map(Object.values(next.providers).map(provider => [provider.label, provider]));
  const ids = new Set(next.capabilities.map(record => record.id));
  const retained = previous.capabilities.flatMap(record => {
    const provider = updated.get(record.provider);
    if (!provider) return [record];
    if (ids.has(record.id)) return [];
    return provider.status === "failed" || provider.partial
      ? [{...record, evidence:{...record.evidence,status:"stale" as const}}] : [];
  });
  return {capabilities:[...retained,...next.capabilities],providers:{...previous.providers,...next.providers},fetchedAt:next.fetchedAt};
}
export function protocolForDisplay(response: ProtocolCapabilityResponse, now = Date.now()): ProtocolCapabilityResponse {
  return {...response, capabilities:response.capabilities.map(record => {
    const observed = record.evidence.observedAt < 1e12 ? record.evidence.observedAt * 1000 : record.evidence.observedAt;
    return now - observed >= PROTOCOL_CAPABILITY_TTL_MS ? {...record,evidence:{...record.evidence,status:"stale" as const}} : record;
  })};
}
