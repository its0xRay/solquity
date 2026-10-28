import backpack from "../reports/backpack-token-registry.json";
import type { Asset, Variant } from "./types";

// Explicit underlying-security aliases, not ticker-based grouping. Keep share classes
// and leveraged/inverse funds separate. The original IDs remain valid data routes.
export const securityGroups = [
  {id:"sp500",members:["sp500","spdr-sandp-500-etf"],name:"SPDR S&P 500 ETF",symbol:"SPY",source:"https://assets.backed.fi/products/sp500-xstock"},
  {id:"nasdaq",members:["nasdaq","invesco-qqq"],name:"Invesco QQQ",symbol:"QQQ",source:"https://assets.backed.fi/products/nasdaq-xstock"},
  {id:"tqqq",members:["tqqq","proshares-ultrapro-qqq"],name:"ProShares UltraPro QQQ",symbol:"TQQQ",source:"https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq"},
] as const;

export function securityGroup(assetId:string) { return securityGroups.find(group => (group.members as readonly string[]).includes(assetId)); }
export function canonicalAssetId(assetId:string) { return securityGroup(assetId)?.id ?? assetId; }
export function assetMembers(assetId:string):readonly string[] { return securityGroup(assetId)?.members ?? [assetId]; }
export function backpackToken(mint:string) { return backpack.tokens.find(token => token.mint === mint); }

// Exact addresses checked against each issuer product page on 2026-10-28.
const reviewedEtfTokens:Record<string,{issuer:"xStocks"|"Ondo";source:string}> = {
  XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W:{issuer:"xStocks",source:"https://assets.backed.fi/products/sp500-xstock"},
  Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ:{issuer:"xStocks",source:"https://assets.backed.fi/products/nasdaq-xstock"},
  XsjQP3iMAaQ3kQScQKthQpx9ALRbjKAjQtHg6TFomoc:{issuer:"xStocks",source:"https://assets.backed.fi/products/tqqq-xstock"},
  k18WJUULWheRkSpSquYGdNNmtuE2Vbw1hpuUi92ondo:{issuer:"Ondo",source:"https://app.ondo.finance/assets/spyon"},
  HrYNm6jTQ71LoFphjVKBTdAE4uja7WsmLG8VxB8ondo:{issuer:"Ondo",source:"https://app.ondo.finance/assets/qqqon"},
  "14W1itEkV7k1W819mLSknFTaMmkCtPokbF2tRkPUondo":{issuer:"Ondo",source:"https://app.ondo.finance/assets/tqqqon"},
};
export function tokenIdentity(mint:string) {
  return backpackToken(mint) ? {issuer:"Backpack",source:backpack.source} : Object.hasOwn(reviewedEtfTokens,mint) ? reviewedEtfTokens[mint] : undefined;
}

export function normalizeVariant(variant:Variant,sourceAssetId?:string):Variant {
  const token = backpackToken(variant.mint);
  const identity = tokenIdentity(variant.mint);
  return {...variant,...(sourceAssetId ? {sourceAssetId} : {}),...(identity ? {issuer:identity.issuer,issuerUrl:identity.source} : {}),...(token?.kind === "fund" && /ETF|QQQ|Oil Fund/.test(token.name) ? {kind:"etf"} : {})};
}

export function normalizeAsset(asset:Asset):Asset {
  const group = securityGroup(asset.assetId);
  const primaryVariant = asset.primaryVariant ? normalizeVariant(asset.primaryVariant,asset.assetId) : asset.primaryVariant;
  const variants = asset.variants?.map(variant => normalizeVariant(variant,asset.assetId));
  const isEtf = group || asset.category === "etf" || primaryVariant?.kind === "etf" || primaryVariant?.kind === "leveraged";
  return {...asset,assetId:group?.id ?? asset.assetId,...(group ? {name:group.name,symbol:group.symbol} : {}),category:isEtf ? "etf" : asset.category,primaryVariant,variants};
}

export function groupAssets(assets:Asset[]):Asset[] {
  const grouped = new Map<string,Asset>();
  for (const input of assets) {
    const asset = normalizeAsset(input);
    const previous = grouped.get(asset.assetId);
    if (!previous) {grouped.set(asset.assetId,asset);continue;}
    const variants = [...new Map([...(previous.variants ?? []),...(previous.primaryVariant ? [previous.primaryVariant] : []),...(asset.variants ?? []),...(asset.primaryVariant ? [asset.primaryVariant] : [])].map(item => [item.mint,item])).values()];
    const preferred = (asset.stats?.liquidity ?? 0) > (previous.stats?.liquidity ?? 0) ? asset : previous;
    // Don't sum potentially overlapping upstream liquidity or volume snapshots.
    grouped.set(asset.assetId,{...preferred,variants});
  }
  return [...grouped.values()];
}
