import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../lib/tokens", () => ({getVariantMints:vi.fn(async () => ["mint"]),getVariantMarkets:vi.fn(async () => ({status:"success",data:[],fetchedAt:1}))}));
vi.mock("../lib/rate-limit", () => ({enforceRateLimit:()=>null}));
vi.mock("../lib/protocol-capabilities", () => ({
  capabilityAdapters:[{id:"kamino"},{id:"meteora"},{id:"raydium"},{id:"orca"}],
  getProtocolCapabilities:vi.fn(async () => ({capabilities:[],providers:{},fetchedAt:1})),
}));
import { GET } from "../app/api/capabilities/route";
import { getVariantMarkets, getVariantMints } from "../lib/tokens";
import { getProtocolCapabilities } from "../lib/protocol-capabilities";
beforeEach(() => vi.clearAllMocks());
describe("independent protocol endpoints", () => {
  it("does not wait for Tokens markets in a Kamino-only request", async () => {
    const result = await GET(new NextRequest("https://example.test/api/capabilities?asset=tesla&mint=mint&provider=kamino"));
    expect(result.status).toBe(200);
    expect(getVariantMarkets).not.toHaveBeenCalled();
    expect(vi.mocked(getProtocolCapabilities).mock.calls[0][0].adapters?.map(adapter=>adapter.id)).toEqual(["kamino"]);
  });
  it("retains the combined endpoint for existing clients", async () => {
    await GET(new NextRequest("https://example.test/api/capabilities?asset=tesla&mint=mint"));
    expect(getVariantMarkets).toHaveBeenCalledWith("tesla","mint");
    expect(vi.mocked(getProtocolCapabilities).mock.calls[0][0].adapters).toHaveLength(4);
  });
  it("validates provider groups before external calls", async () => {
    expect((await GET(new NextRequest("https://example.test/api/capabilities?asset=tesla&mint=mint&provider=untrusted"))).status).toBe(400);
    expect(getVariantMints).not.toHaveBeenCalled();
  });
});
