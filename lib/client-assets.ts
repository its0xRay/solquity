import type { Asset, Variant } from "./types";

function clientVariant(variant: Variant): Variant {
  return {
    variantId: variant.variantId,
    mint: variant.mint,
    kind: variant.kind,
    issuer: variant.issuer,
    issuerUrl: variant.issuerUrl,
    label: variant.label,
    symbol: variant.symbol,
    stockVariantTier: variant.stockVariantTier,
  };
}

export function clientAsset(asset: Asset): Asset {
  return {
    assetId: asset.assetId,
    name: asset.name,
    symbol: asset.symbol,
    category: asset.category,
    imageUrl: asset.imageUrl,
    stats: asset.stats ? { liquidity: asset.stats.liquidity } : null,
    primaryVariant: asset.primaryVariant ? clientVariant(asset.primaryVariant) : null,
    variants: asset.variants?.map(clientVariant),
  };
}

export function clientAssets(assets: Asset[]) {
  return assets.map(clientAsset);
}
