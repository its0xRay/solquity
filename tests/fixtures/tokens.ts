import { CapabilityRecord, VenueMarket } from "../../lib/types";

export const markets: VenueMarket[] = [
  { address: "market-a", source: "raydium", volume24h: 1200, liquidity: 5000, protocol: { name: "Raydium" } },
  { address: "market-b", source: "orca", volume24h: 800, liquidity: 3000, protocol: { name: "Orca" } },
];

export function capability(status: CapabilityRecord["evidence"]["status"]): CapabilityRecord {
  return {
    id: `mint:earn:${status}`, assetId: "tesla", mint: "mint", kind: "earn", provider: "Fixture",
    providerCapability: "supply", metrics: [], evidence: { source: "Fixture", observedAt: 1, fetchedAt: 1, status },
  };
}
