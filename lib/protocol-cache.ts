import type { ProtocolCapabilityResponse } from "./types";

export const PROTOCOL_CAPABILITY_TTL_MS = 2 * 60_000;
export type ProtocolCacheEntry = { response: ProtocolCapabilityResponse; cachedAt: number };

export function isProtocolCacheFresh(entry: ProtocolCacheEntry | undefined, now = Date.now()) {
  return Boolean(entry && now - entry.cachedAt < PROTOCOL_CAPABILITY_TTL_MS);
}
