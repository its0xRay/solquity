import type { Variant } from "./types";
import type { ScenarioInputs } from "./scenario";
import { positiveAmount } from "./scenario";
import { canonicalAssetId } from "./asset-identity";

export type AssetQuery = { asset?: string; mint?: string; version?: string; mode?: string; amount?: string; days?: string; loan?: string; decline?: string };
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function versionBase(variant: Variant) {
  const identity = `${variant.issuer ?? ""} ${variant.label ?? ""} ${variant.issuerUrl ?? ""}`.toLowerCase();
  if (identity.includes("xstock")) return "xstocks";
  if (identity.includes("ondo")) return "ondo";
  if (identity.includes("backpack")) return "backpack";
  return slug(variant.symbol ?? variant.label ?? "version") || "version";
}
export function versionSlug(variant: Variant, variants: Variant[]) {
  const base = versionBase(variant);
  const peers = variants.filter(item => versionBase(item) === base);
  if (peers.length === 1) return base;
  const symbol = slug(variant.symbol ?? "version");
  const sameSymbol = peers.filter(item => slug(item.symbol ?? "version") === symbol);
  const suffix = sameSymbol.length > 1 ? `-${[...sameSymbol].sort((a,b) => a.mint.localeCompare(b.mint)).findIndex(item => item.mint === variant.mint) + 1}` : "";
  return `${base}-${symbol}${suffix}`;
}
export function resolveVersion(variants: Variant[], query: Pick<AssetQuery, "mint" | "version">) {
  if (query.mint) return variants.find(item => item.mint === query.mint);
  if (!query.version) return undefined;
  const current = variants.find(item => versionSlug(item, variants) === query.version);
  if (current) return current;
  // Preserve older shared URLs when a previously unnamed provider becomes identified.
  const legacy = variants.filter(item => slug(item.symbol ?? "") === query.version);
  return legacy.length === 1 ? legacy[0] : undefined;
}
export function stockPath(assetId: string) { return `/stocks/${encodeURIComponent(canonicalAssetId(assetId))}`; }
export function assetUrl({assetId, variant, variants, defaultMint, scenario, home = false}: {
  assetId: string; variant: Variant; variants: Variant[]; defaultMint?: string; scenario: ScenarioInputs; home?: boolean;
}) {
  let pathname = home && assetId === "tesla" && !scenario.mode ? "/" : stockPath(assetId);
  if (scenario.mode) pathname += `/${scenario.mode}`;
  const params = new URLSearchParams();
  if (variant.mint !== defaultMint) params.set("version", versionSlug(variant, variants));
  if (scenario.mode) {
    if (positiveAmount(scenario.amount)) params.set("amount", scenario.amount);
    params.set("days", String(scenario.days));
    if (scenario.mode === "borrow") {
      if (positiveAmount(scenario.loan)) params.set("loan", scenario.loan);
      params.set("decline", String(scenario.decline));
    }
  }
  return `${pathname}${params.size ? `?${params}` : ""}`;
}
