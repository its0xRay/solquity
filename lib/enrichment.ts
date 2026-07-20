import { CapabilityKind, SourceResult } from "./types";

export type RawEnrichmentEnvelope<T> = {
  provider: string;
  marketId: string;
  mint: string;
  fetchedAt: number;
  payload: T;
};

export type ProviderReportedMetric = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  rawPath: string;
  reportedAt?: number;
};

export type NormalizedEnrichmentRecord = {
  provider: string;
  marketId: string;
  mint: string;
  capability: CapabilityKind;
  metrics: ProviderReportedMetric[];
  sourceUrl?: string;
  fetchedAt: number;
};

export type EnrichmentContext = { assetId: string; mint: string; marketId: string; now: number };

export interface VenueEnrichmentAdapter<TRaw> {
  readonly id: string;
  fetch(context: EnrichmentContext): Promise<SourceResult<RawEnrichmentEnvelope<TRaw>>>;
  normalize(raw: RawEnrichmentEnvelope<TRaw>): SourceResult<NormalizedEnrichmentRecord>;
}

export function isProvenanceComplete(record: NormalizedEnrichmentRecord) {
  return Boolean(record.provider && record.marketId && record.mint && Number.isFinite(record.fetchedAt) && record.fetchedAt > 0)
    && record.metrics.every((metric) => Boolean(metric.key && metric.label && metric.rawPath));
}
