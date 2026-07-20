import { describe, expect, it, vi } from "vitest";
import type { CapabilityAdapter } from "../lib/adapters/types";
import type { CapabilityRecord, SourceResult } from "../lib/types";
import { capabilityAdapters, getProtocolCapabilities } from "../lib/protocol-capabilities";
import { sourceFailure, sourcePartial, sourceSuccess } from "../lib/source-result";
import { capability } from "./fixtures/tokens";

function adapter(id: string, options: { fails?: boolean; requiresMarkets?: boolean } = {}): CapabilityAdapter {
  return {
    id,
    label: id,
    requiresMarkets: options.requiresMarkets,
    discover: vi.fn(async () => sourceSuccess([])),
    capabilities: vi.fn(async () => {
      if (options.fails) throw new Error(`${id} offline`);
      return sourceSuccess([{ ...capability("active"), id: `${id}-record`, provider: id }], 100);
    }),
  };
}

describe("protocol capability isolation", () => {
  it("registers each protocol as an independent adapter", () => {
    expect(capabilityAdapters.map((item) => item.id)).toEqual(["kamino", "meteora", "raydium", "orca"]);
  });

  it("preserves a healthy provider when another provider fails", async () => {
    const healthy = adapter("healthy");
    const broken = adapter("broken", { fails: true });
    const result = await getProtocolCapabilities({
      assetId: "tesla", mint: "mint", knownMints: ["mint"], marketResult: sourceSuccess([]), adapters: [broken, healthy], now: 100,
    });
    expect(result.capabilities.map((record) => record.provider)).toEqual(["healthy"]);
    expect(result.providers.broken.status).toBe("failed");
    expect(result.providers.healthy.status).toBe("success");
  });

  it("blocks only market-dependent providers when Tokens market data fails", async () => {
    const independent = adapter("independent");
    const marketDependent = adapter("market-dependent", { requiresMarkets: true });
    const result = await getProtocolCapabilities({
      assetId: "tesla", mint: "mint", knownMints: ["mint"], marketResult: sourceFailure(new Error("Tokens offline")), adapters: [independent, marketDependent], now: 100,
    });
    expect(result.capabilities.map((record) => record.provider)).toEqual(["independent"]);
    expect(result.providers["market-dependent"].status).toBe("failed");
    expect(marketDependent.capabilities).not.toHaveBeenCalled();
  });

  it("returns other providers when one adapter exceeds its deadline", async () => {
    const healthy = adapter("healthy");
    const slow: CapabilityAdapter = {
      id: "slow",
      label: "slow",
      discover: vi.fn(async () => sourceSuccess([])),
      capabilities: vi.fn(() => new Promise<SourceResult<CapabilityRecord[]>>(() => {})),
    };
    const result = await getProtocolCapabilities({
      assetId: "tesla", mint: "mint", knownMints: ["mint"], marketResult: sourceSuccess([]), adapters: [slow, healthy], now: 100, adapterDeadlineMs: 5,
    });
    expect(result.providers.slow.status).toBe("failed");
    expect(result.capabilities.map((record) => record.provider)).toEqual(["healthy"]);
  });

  it("keeps partial provider metadata without dropping verified records", async () => {
    const partial: CapabilityAdapter = {
      id: "partial",
      label: "partial",
      discover: vi.fn(async () => sourceSuccess([])),
      capabilities: vi.fn(async () => sourcePartial([{ ...capability("active"), provider: "partial" }], 2, 100)),
    };
    const result = await getProtocolCapabilities({
      assetId: "tesla", mint: "mint", knownMints: ["mint"], marketResult: sourceSuccess([]), adapters: [partial], now: 100,
    });
    expect(result.capabilities).toHaveLength(1);
    expect(result.providers.partial.partial).toEqual({ failedItems: 2 });
  });
});
