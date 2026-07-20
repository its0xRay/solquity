import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CapabilityKind, CapabilityRecord } from "../lib/types";

type TokensAsset = {
  assetId: string;
  category: string;
  error?: string | null;
  mints?: string[];
  labels?: Array<string | null>;
};
type TokensCoverage = { summary: Record<string, number | string>; assets: TokensAsset[] };
type MarketRecord = {
  assetId: string;
  assetName?: string | null;
  assetCategory: string;
  variantLabel?: string | null;
  mint: string;
  marketAddress: string;
  productStatus: string;
  venue?: { name?: string } | null;
};
type VenueInventory = { generatedAt: string; records: MarketRecord[]; failures: Array<{ assetId: string; message: string }> };
type ProbeResult = { assetId: string; mint: string; marketId: string; status: string; hasWarning?: boolean };
type Probe = { summary: Record<string, number | string | Record<string, number>>; results: ProbeResult[] };
type KaminoRow = { assetId: string; category: string; label: string | null; mint: string; capabilities: CapabilityRecord[] };
type KaminoCoverage = { generatedAt: string; tokensMints: number; exactMatches: number; assets: KaminoRow[] };

const reportDir = resolve(process.cwd(), "reports");

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(reportDir, name), "utf8")) as T;
}

function distinct<T>(values: Iterable<T>) {
  return [...new Set(values)];
}

async function main() {
  const [tokens, inventory, kamino, meteora, raydium, orca] = await Promise.all([
    readJson<TokensCoverage>("tokens-coverage.json"),
    readJson<VenueInventory>("tokens-venue-inventory.json"),
    readJson<KaminoCoverage>("kamino-coverage.json"),
    readJson<Probe>("meteora-enrichment-probe.json"),
    readJson<Probe>("raydium-enrichment-probe.json"),
    readJson<Probe>("orca-enrichment-probe.json"),
  ]);

  const marketsByMint = new Map<string, MarketRecord[]>();
  const eligibleMarketKeys = new Set<string>();
  for (const market of inventory.records) {
    if (market.productStatus === "excluded") continue;
    marketsByMint.set(market.mint, [...(marketsByMint.get(market.mint) ?? []), market]);
    eligibleMarketKeys.add(`${market.marketAddress}:${market.mint}`);
  }

  const liquidityByMint = new Map<string, Array<{ provider: string; marketId: string; warning: boolean }>>();
  const acceptedProbeResults = new Map<string, ProbeResult[]>();
  for (const [provider, probe] of [["Meteora", meteora], ["Raydium", raydium], ["Orca", orca]] as const) {
    const accepted = probe.results.filter((item) => item.status === "matched" && eligibleMarketKeys.has(`${item.marketId}:${item.mint}`));
    acceptedProbeResults.set(provider, accepted);
    for (const result of accepted) {
      liquidityByMint.set(result.mint, [...(liquidityByMint.get(result.mint) ?? []), {
        provider, marketId: result.marketId, warning: provider === "Orca" && result.hasWarning === true,
      }]);
    }
  }

  const kaminoByMint = new Map(kamino.assets.map((row) => [row.mint, row]));
  const variants = tokens.assets.flatMap((asset) => (asset.mints ?? []).map((mint, index) => {
    const markets = marketsByMint.get(mint) ?? [];
    const liquidity = liquidityByMint.get(mint) ?? [];
    const kaminoRow = kaminoByMint.get(mint);
    const kaminoCapabilities = kaminoRow?.capabilities ?? [];
    const kinds = distinct<CapabilityKind>([
      ...(markets.length ? ["trade" as const] : []),
      ...kaminoCapabilities.map((record) => record.kind),
      ...(liquidity.length ? ["liquidity" as const] : []),
    ]);
    const providers = distinct([
      ...markets.map((market) => market.venue?.name ?? "Tokens.xyz market"),
      ...kaminoCapabilities.map((record) => record.provider),
      ...liquidity.map((record) => record.provider),
    ]).sort();
    return {
      assetId: asset.assetId,
      category: asset.category,
      mint,
      label: asset.labels?.[index] ?? null,
      capabilities: kinds.sort(),
      providers,
      tradeMarkets: markets.length,
      liquidityPools: liquidity.length,
      orcaWarnings: liquidity.filter((record) => record.warning).length,
      kaminoMarkets: distinct(kaminoCapabilities.map((record) => record.marketId).filter(Boolean)).length,
    };
  }));

  const assets = tokens.assets.map((asset) => {
    const rows = variants.filter((variant) => variant.assetId === asset.assetId);
    return {
      assetId: asset.assetId,
      category: asset.category,
      variants: rows.length,
      capabilities: distinct(rows.flatMap((row) => row.capabilities)).sort(),
      providers: distinct(rows.flatMap((row) => row.providers)).sort(),
      tradeMarkets: rows.reduce((sum, row) => sum + row.tradeMarkets, 0),
      liquidityPools: rows.reduce((sum, row) => sum + row.liquidityPools, 0),
      orcaWarnings: rows.reduce((sum, row) => sum + row.orcaWarnings, 0),
    };
  });

  const countKind = (kind: CapabilityKind) => variants.filter((row) => row.capabilities.includes(kind)).length;
  const providerRows = [
    { provider: "Kamino", records: kamino.assets.flatMap((row) => row.capabilities.map((record) => ({ assetId: row.assetId, mint: row.mint, id: record.id }))) },
    ...[["Meteora", meteora], ["Raydium", raydium], ["Orca", orca]].map(([provider]) => ({
      provider: String(provider),
      records: (acceptedProbeResults.get(String(provider)) ?? []).map((result) => ({ assetId: result.assetId, mint: result.mint, id: result.marketId })),
    })),
  ].map(({ provider, records }) => ({
    provider,
    capabilityRecords: records.length,
    assets: distinct(records.map((record) => record.assetId)).length,
    variants: distinct(records.map((record) => record.mint)).length,
  }));

  const tradeOnly = variants.filter((row) => row.capabilities.length === 1 && row.capabilities[0] === "trade");
  const noCapabilities = variants.filter((row) => row.capabilities.length === 0);
  const multiCapability = variants.filter((row) => row.capabilities.length > 1);
  const invalidProviderResults = [meteora, raydium, orca].flatMap((probe) => probe.results.filter((result) => result.status !== "matched"));
  const probeResultsOutsideCurrentInventory = [meteora, raydium, orca].flatMap((probe) => probe.results.filter((result) =>
    result.status === "matched" && !eligibleMarketKeys.has(`${result.marketId}:${result.mint}`)));
  const generatedAt = new Date().toISOString();
  const summary = {
    generatedAt,
    evidenceGeneratedAt: {
      tokens: String(tokens.summary.generatedAt), venues: inventory.generatedAt, kamino: kamino.generatedAt,
      meteora: String(meteora.summary.generatedAt), raydium: String(raydium.summary.generatedAt), orca: String(orca.summary.generatedAt),
    },
    assets: assets.length,
    variants: variants.length,
    variantsWithTrade: countKind("trade"),
    variantsWithEarn: countKind("earn"),
    variantsWithBorrow: countKind("borrow"),
    variantsWithLiquidity: countKind("liquidity"),
    tradeOnlyVariants: tradeOnly.length,
    multiCapabilityVariants: multiCapability.length,
    variantsWithNoVisibleCapability: noCapabilities.length,
    assetsWithMultipleCapabilities: assets.filter((asset) => asset.capabilities.length > 1).length,
    orcaWarningPools: variants.reduce((sum, row) => sum + row.orcaWarnings, 0),
    tokensAssetFailures: Number(tokens.summary.failedAssets ?? 0),
    tokensVenueInventoryFailures: inventory.failures.length,
    providerProbeNonMatches: invalidProviderResults.length,
    providerProbeMatchesOutsideCurrentInventory: probeResultsOutsideCurrentInventory.length,
  };

  const requestedJourneys = ["spacex", "tesla", "microsoft", "sp500"].map((assetId) => assets.find((asset) => asset.assetId === assetId)).filter(Boolean);
  const journeyCandidates = {
    requested: requestedJourneys,
    tradeOnly: tradeOnly.slice(0, 10),
    multipleVersions: assets.filter((asset) => asset.variants > 1).slice(0, 10),
    orcaWarning: assets.filter((asset) => asset.orcaWarnings > 0).slice(0, 10),
    noVisibleCapability: noCapabilities.slice(0, 10),
  };

  const artifact = { summary, providers: providerRows, journeyCandidates, assets, variants, invalidProviderResults, probeResultsOutsideCurrentInventory };
  await mkdir(reportDir, { recursive: true });
  await writeFile(resolve(reportDir, "capability-acceptance.json"), JSON.stringify(artifact, null, 2));
  const kindRows = [
    ["Trade", summary.variantsWithTrade], ["Lend", summary.variantsWithEarn], ["Borrow", summary.variantsWithBorrow], ["Liquidity", summary.variantsWithLiquidity],
  ].map(([kind, count]) => `| ${kind} | ${count} |`).join("\n");
  const providerTable = providerRows.map((row) => `| ${row.provider} | ${row.assets} | ${row.variants} | ${row.capabilityRecords} |`).join("\n");
  await writeFile(resolve(reportDir, "capability-acceptance.md"), `# Capability Map acceptance coverage\n\nGenerated: ${generatedAt}\n\nThis report joins only exact Tokens.xyz assets, variants, and markets with the latest accepted first-party protocol probe artifacts. Counts describe evidence coverage; they are not financial calculations, rankings, or recommendations.\n\n## User-facing capability coverage\n\n| Capability | Variants |\n|---|---:|\n${kindRows}\n\n| Coverage state | Variants |\n|---|---:|\n| Trade only | ${summary.tradeOnlyVariants} |\n| Multiple capability kinds | ${summary.multiCapabilityVariants} |\n| No visible capability | ${summary.variantsWithNoVisibleCapability} |\n\nAssets with multiple capability kinds: ${summary.assetsWithMultipleCapabilities}.\n\n## External provider evidence\n\n| Provider | Assets | Variants | Accepted records |\n|---|---:|---:|---:|\n${providerTable}\n\nOrca pools carrying Orca's warning flag: ${summary.orcaWarningPools}.\n\n## Integrity checks\n\n- Tokens asset failures: ${summary.tokensAssetFailures}\n- Tokens venue inventory failures: ${summary.tokensVenueInventoryFailures}\n- Provider probe results not accepted as matches: ${summary.providerProbeNonMatches}\n- Previously matched provider records no longer in the current Tokens inventory: ${summary.providerProbeMatchesOutsideCurrentInventory}\n- Exact variant rows audited: ${summary.variants}\n\nRepresentative journey candidates and the complete asset/variant matrix are stored in \`reports/capability-acceptance.json\`.\n`);
  console.log(JSON.stringify({ summary, providers: providerRows, journeyCandidates }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
