import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RawEnrichmentEnvelope } from "../lib/enrichment";
import { RaydiumPool, normalizeRaydiumPool, raydiumPoolsResponseSchema } from "../lib/adapters/raydium";

type InventoryRecord = { assetId: string; mint: string; marketAddress: string; venue?: { name?: string } | null };
type ProbeStatus = "matched" | "not_found" | "invalid_response" | "request_failed";
type ProbeResult = { assetId: string; mint: string; marketId: string; status: ProbeStatus; enrichment?: ReturnType<typeof normalizeRaydiumPool>; message?: string };

const API = "https://api-v3.raydium.io/pools/info/ids";
const BATCH_SIZE = 20;

async function fetchBatch(records: InventoryRecord[]): Promise<ProbeResult[]> {
  const addresses = [...new Set(records.map((record) => record.marketAddress))];
  try {
    const response = await fetch(`${API}?ids=${addresses.map(encodeURIComponent).join(",")}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "request_failed", message: `HTTP ${response.status}` }));
    const parsed = raydiumPoolsResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      const message = parsed.error.issues.slice(0, 3).map((issue) => issue.message).join("; ");
      return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "invalid_response", message }));
    }
    const byId = new Map(parsed.data.data.map((pool) => [pool.id, pool]));
    const fetchedAt = Date.now();
    return records.map((record) => {
      const pool = byId.get(record.marketAddress);
      if (!pool) return { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "not_found" };
      const raw: RawEnrichmentEnvelope<RaydiumPool> = { provider: "Raydium", marketId: record.marketAddress, mint: record.mint, fetchedAt, payload: pool };
      const enrichment = normalizeRaydiumPool(raw);
      return enrichment
        ? { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "matched", enrichment }
        : { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "invalid_response", message: "Pool address or variant mint did not match" };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown request error";
    return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "request_failed", message }));
  }
}

async function main() {
  const inventory = JSON.parse(await readFile(resolve(process.cwd(), "reports/tokens-venue-inventory.json"), "utf8")) as { records: InventoryRecord[] };
  const records = inventory.records.filter((record) => /^Raydium(?: |$)/i.test(record.venue?.name ?? ""));
  const queue = [...new Map(records.map((record) => [`${record.marketAddress}:${record.mint}`, record])).values()];
  const results: ProbeResult[] = [];
  for (let cursor = 0; cursor < queue.length; cursor += BATCH_SIZE) {
    results.push(...await fetchBatch(queue.slice(cursor, cursor + BATCH_SIZE)));
    console.log(`Probed ${Math.min(cursor + BATCH_SIZE, queue.length)}/${queue.length} Raydium markets`);
  }
  results.sort((a, b) => a.marketId.localeCompare(b.marketId) || a.mint.localeCompare(b.mint));
  const matched = results.filter((result) => result.status === "matched");
  const metricCoverage = Object.fromEntries(["tvl", "volume24h", "fees24h", "apr24h", "feeApr24h", "feeRate", "tickSpacing"].map((key) => [key,
    matched.filter((result) => result.enrichment?.metrics.some((metric) => metric.key === key)).length,
  ]));
  const summary = {
    generatedAt: new Date().toISOString(),
    tokensConfirmedMarketMints: queue.length,
    tokensConfirmedMarkets: new Set(queue.map((record) => record.marketAddress)).size,
    matched: matched.length,
    notFound: results.filter((result) => result.status === "not_found").length,
    invalidResponse: results.filter((result) => result.status === "invalid_response").length,
    requestFailed: results.filter((result) => result.status === "request_failed").length,
    metricCoverage,
  };
  await writeFile(resolve(process.cwd(), "reports/raydium-enrichment-probe.json"), JSON.stringify({ summary, results }, null, 2));
  await writeFile(resolve(process.cwd(), "reports/raydium-enrichment-probe.md"), `# Raydium enrichment probe\n\nGenerated: ${summary.generatedAt}\n\nOnly exact Raydium market addresses and variant mints already returned by Tokens.xyz were queried. No independent venue discovery, symbol matching, aggregation, ranking, or manual pool mapping was used.\n\n| Result | Count |\n|---|---:|\n| Tokens-confirmed market-mint pairs | ${summary.tokensConfirmedMarketMints} |\n| Tokens-confirmed unique markets | ${summary.tokensConfirmedMarkets} |\n| Matched by official Raydium API | ${summary.matched} |\n| Not returned by Raydium | ${summary.notFound} |\n| Invalid or identity mismatch | ${summary.invalidResponse} |\n| Request failed | ${summary.requestFailed} |\n\n## Exact provider metric coverage\n\n| Metric | Matched pools reporting it |\n|---|---:|\n${Object.entries(metricCoverage).map(([key, count]) => `| ${key} | ${count} |`).join("\n")}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
