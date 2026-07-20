import { kaminoAdapter } from "./adapters/kamino";
import { meteoraAdapter } from "./adapters/meteora";
import { orcaAdapter } from "./adapters/orca";
import { raydiumAdapter } from "./adapters/raydium";
import type { CapabilityAdapter } from "./adapters/types";
import { aggregateDisplayCapabilities, type CapabilityBatch } from "./capabilities";
import { sourceFailure } from "./source-result";
import type { ProtocolCapabilityResponse, SourceResult, VenueMarket } from "./types";

export const capabilityAdapters: CapabilityAdapter[] = [kaminoAdapter, meteoraAdapter, raydiumAdapter, orcaAdapter];
const ADAPTER_DEADLINE_MS = 8_000;

async function adapterCapabilities(
  adapter: CapabilityAdapter,
  context: { assetId: string; mint: string; now: number; markets: VenueMarket[] },
  deadlineMs: number,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = adapter.capabilities({ ...context, signal: controller.signal }).catch((error) => sourceFailure<never[]>(error, context.now));
  const deadline = new Promise<SourceResult<never[]>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException(`${adapter.label} deadline exceeded`, "TimeoutError"));
      resolve(sourceFailure(new Error(`${adapter.label} deadline exceeded`), context.now));
    }, deadlineMs);
  });
  try {
    return await Promise.race([request, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getProtocolCapabilities({
  assetId,
  mint,
  knownMints,
  marketResult,
  adapters = capabilityAdapters,
  now = Date.now(),
  adapterDeadlineMs = ADAPTER_DEADLINE_MS,
}: {
  assetId: string;
  mint: string;
  knownMints: string[];
  marketResult: SourceResult<VenueMarket[]>;
  adapters?: CapabilityAdapter[];
  now?: number;
  adapterDeadlineMs?: number;
}): Promise<ProtocolCapabilityResponse> {
  const settled = await Promise.all(adapters.map(async (adapter) => {
    if (adapter.requiresMarkets && marketResult.status === "failed") {
      return { adapter, result: sourceFailure<never[]>(new Error("Tokens.xyz market data unavailable"), now) };
    }
    try {
      const result = await adapterCapabilities(adapter, {
        assetId,
        mint,
        now,
        markets: marketResult.status === "failed" ? [] : marketResult.data,
      }, adapterDeadlineMs);
      return { adapter, result };
    } catch (error) {
      return { adapter, result: sourceFailure<never[]>(error, now) };
    }
  }));

  const batches: CapabilityBatch[] = settled.map(({ adapter, result }) => ({ provider: adapter.label, result }));
  const capabilities = aggregateDisplayCapabilities({ knownMints, batches, now }).capabilities;
  const providers = Object.fromEntries(settled.map(({ adapter, result }) => [adapter.id, {
    label: adapter.label,
    status: result.status,
    fetchedAt: result.fetchedAt,
    ...(result.status === "success" && result.partial ? { partial: result.partial } : {}),
    ...(result.status === "success" ? {} : { error: result.error }),
  }]));

  return { capabilities, providers, fetchedAt: now };
}
