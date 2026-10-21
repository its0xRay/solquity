import { describe, expect, it } from "vitest";
import { mergeAssetDetail, mergeProtocolResponse, protocolForDisplay } from "../lib/progressive-data";
import type { AssetDetail, ProtocolCapabilityResponse } from "../lib/types";
import { capability } from "./fixtures/tokens";
const now = Date.now();
const record = {...capability("active"),provider:"Kamino",evidence:{...capability("active").evidence,observedAt:now}};
const kamino: ProtocolCapabilityResponse = {capabilities:[record],providers:{kamino:{label:"Kamino",status:"success",fetchedAt:now}},fetchedAt:now};
describe("progressive results and stale evidence", () => {
  it("does not erase Kamino when slower pool results arrive", () => {
    const next: ProtocolCapabilityResponse = {capabilities:[],providers:{orca:{label:"Orca",status:"success",fetchedAt:now}},fetchedAt:now};
    const merged = mergeProtocolResponse(kamino,next);
    expect(merged.capabilities).toEqual([record]);
    expect(Object.keys(merged.providers)).toEqual(["kamino","orca"]);
  });
  it("retains failed-provider facts as stale, not fresh", () => {
    const next: ProtocolCapabilityResponse = {capabilities:[],providers:{kamino:{label:"Kamino",status:"failed",fetchedAt:now}},fetchedAt:now};
    expect(mergeProtocolResponse(kamino,next).capabilities[0].evidence.status).toBe("stale");
    expect(protocolForDisplay(kamino,now+120_000).capabilities[0].evidence.status).toBe("stale");
    expect(kamino.capabilities[0].evidence.status).toBe("active");
  });
  it("merges selected-market data without erasing loaded technical context", () => {
    const previous: AssetDetail = {asset:{assetId:"tesla",category:"equity"},variants:[],marketResultsByMint:{},displayMarketsByMint:{},displayCapabilitiesByMint:{},riskResultsByMint:{mint:{status:"success",data:{},fetchedAt:now}},fetchedAt:now};
    const merged = mergeAssetDetail(previous,{...previous,riskResultsByMint:{},displayMarketsByMint:{mint:[]}});
    expect(merged.riskResultsByMint).toEqual(previous.riskResultsByMint);
    expect(merged.displayMarketsByMint).toEqual({mint:[]});
  });
});
