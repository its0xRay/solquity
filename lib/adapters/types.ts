import { CapabilityRecord, SourceResult, VenueMarket } from "../types";

export type AdapterContext = { assetId: string; mint: string; now: number; markets?: VenueMarket[]; signal?: AbortSignal };

export interface CapabilityAdapter {
  readonly id: string;
  readonly label: string;
  readonly requiresMarkets?: boolean;
  discover(mints: string[]): Promise<SourceResult<string[]>>;
  capabilities(context: AdapterContext): Promise<SourceResult<CapabilityRecord[]>>;
}
