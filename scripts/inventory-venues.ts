import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAssetDetail, getUniverse } from "../lib/tokens";
import { reviewedVenueStatus } from "../lib/venue-status";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  const assets = await getUniverse();
  const records: Array<Record<string, unknown>> = [];
  const failures: Array<{ assetId: string; message: string }> = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < assets.length) {
      const asset = assets[cursor++];
      try {
        const detail = await getAssetDetail(asset.assetId);
        for (const variant of detail.variants) {
          const result = detail.marketResultsByMint[variant.mint];
          if (!result || result.status === "failed") continue;
          for (const market of result.data) {
            const review = reviewedVenueStatus(market);
            records.push({
              assetId: asset.assetId,
              assetName: asset.name ?? null,
              assetCategory: asset.category,
              variantId: variant.variantId,
              variantLabel: variant.label ?? variant.issuer ?? null,
              mint: variant.mint,
              marketAddress: market.address,
              marketName: market.name ?? null,
              venue: market.source ? { name: market.source } : null,
              base: market.base ?? null,
              quote: market.quote ?? null,
              reported: {
                price: market.price ?? null,
                liquidity: market.liquidity ?? null,
                volume24h: market.volume24h ?? null,
                trade24h: market.trade24h ?? null,
                uniqueWallet24h: market.uniqueWallet24h ?? null,
              },
              productStatus: review?.status ?? "eligible",
              review: review ?? null,
              fetchedAt: result.fetchedAt,
            });
          }
        }
      } catch (error) {
        failures.push({ assetId: asset.assetId, message: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        completed += 1;
        if (completed % 25 === 0 || completed === assets.length) console.log(`Inventoried ${completed}/${assets.length} assets`);
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker));
  records.sort((a, b) => String(a.marketAddress).localeCompare(String(b.marketAddress)));

  const venues = new Map<string, { address: string | null; symbol: string | null; name: string; returnedRecords: number; marketAddresses: Set<string>; assets: Set<string>; variants: Set<string>; status: string }>();
  for (const record of records) {
    const venue = record.venue as { address?: string; symbol?: string; name?: string } | null;
    const name = venue?.name ?? "Unattributed by Tokens.xyz";
    const key = venue?.address ?? `unattributed:${name}`;
    const current = venues.get(key) ?? { address: venue?.address ?? null, symbol: venue?.symbol ?? null, name, returnedRecords: 0, marketAddresses: new Set(), assets: new Set(), variants: new Set(), status: String(record.productStatus) };
    current.returnedRecords += 1;
    current.marketAddresses.add(String(record.marketAddress));
    current.assets.add(String(record.assetId));
    current.variants.add(String(record.mint));
    venues.set(key, current);
  }

  const venueSummary = [...venues.values()].map((venue) => ({
    address: venue.address,
    symbol: venue.symbol,
    name: venue.name,
    status: venue.status,
    returnedRecords: venue.returnedRecords,
    uniqueMarkets: venue.marketAddresses.size,
    assets: venue.assets.size,
    variants: venue.variants.size,
  })).sort((a, b) => b.returnedRecords - a.returnedRecords || a.name.localeCompare(b.name));

  const generatedAt = new Date().toISOString();
  const outputDir = resolve(process.cwd(), "reports");
  await mkdir(outputDir, { recursive: true });
  const previous = await readFile(resolve(outputDir, "tokens-venue-inventory.json"), "utf8").then((value) => JSON.parse(value) as { venues?: Array<{ name: string }>; records?: unknown[] }).catch(() => null);
  const currentNames = new Set(venueSummary.map((venue) => venue.name));
  const previousNames = new Set((previous?.venues ?? []).map((venue) => venue.name));
  const changes = previous ? {
    marketRecords: records.length - (previous.records?.length ?? 0),
    addedVenueSources: [...currentNames].filter((name) => !previousNames.has(name)),
    removedVenueSources: [...previousNames].filter((name) => !currentNames.has(name)),
    reviewedExclusionsPresent: venueSummary.filter((venue) => venue.status === "excluded").map((venue) => venue.name),
  } : null;
  const artifact = { generatedAt, source: "Tokens.xyz stock and ETF market records", changesSincePrevious: changes, venues: venueSummary, records, failures };
  const historyDir = resolve(outputDir, "history");
  await mkdir(historyDir, { recursive: true });
  const historyStamp = generatedAt.replaceAll(":", "-");
  await writeFile(resolve(outputDir, "tokens-venue-inventory.json"), JSON.stringify(artifact, null, 2));
  await writeFile(resolve(historyDir, `${historyStamp}-tokens-venue-inventory.json`), JSON.stringify(artifact, null, 2));
  const rows = venueSummary.map((venue) => `| ${venue.name} | ${venue.symbol ?? "—"} | ${venue.status} | ${venue.assets} | ${venue.variants} | ${venue.returnedRecords} | ${venue.uniqueMarkets} |`).join("\n");
  await writeFile(resolve(outputDir, "tokens-venue-inventory.md"), `# Tokens.xyz venue inventory\n\nGenerated: ${generatedAt}\n\nThis inventory contains only market records returned for Tokens.xyz stocks and ETFs. Counts are record coverage, not financial calculations.\n\n| Venue | Symbol | Product status | Assets | Variants | Returned records | Unique market addresses |\n|---|---|---|---:|---:|---:|---:|\n${rows}\n\nAsset-level failures: ${failures.length}.\n`);
  console.log(JSON.stringify({ generatedAt, marketRecords: records.length, venues: venueSummary, assetFailures: failures.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
