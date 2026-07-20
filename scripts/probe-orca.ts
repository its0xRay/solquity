import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RawEnrichmentEnvelope } from "../lib/enrichment";
import { OrcaPool, normalizeOrcaPool, orcaPoolResponseSchema } from "../lib/adapters/orca";

type InventoryRecord = { assetId: string; mint: string; marketAddress: string; venue?: { name?: string } | null };
type ProbeStatus = "matched" | "not_found" | "invalid_response" | "request_failed";
type ProbeResult = { assetId: string; mint: string; marketId: string; status: ProbeStatus; hasWarning?: boolean; enrichment?: ReturnType<typeof normalizeOrcaPool>; message?: string };

const API = "https://api.orca.so/v2/solana/pools";
const REQUEST_INTERVAL_MS = 500;
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000, 25_000];

async function requestWithBackoff(url: string) {
  let response: Response | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (response.status !== 429) return response;
    if (attempt < RETRY_DELAYS_MS.length) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : RETRY_DELAYS_MS[attempt];
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
  return response as Response;
}

async function fetchMarket(records: InventoryRecord[]): Promise<ProbeResult[]> {
  const address = records[0].marketAddress;
  try {
    const url = `${API}/${encodeURIComponent(address)}?stats=24h`;
    const response = await requestWithBackoff(url);
    if (response.status === 404) return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "not_found" }));
    if (!response.ok) return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "request_failed", message: `HTTP ${response.status}` }));
    const parsed = orcaPoolResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      const message = parsed.error.issues.slice(0, 3).map((issue) => issue.message).join("; ");
      return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "invalid_response", message }));
    }
    const pool = parsed.data.data;
    const fetchedAt = Date.now();
    return records.map((record) => {
      const raw: RawEnrichmentEnvelope<OrcaPool> = { provider: "Orca", marketId: record.marketAddress, mint: record.mint, fetchedAt, payload: pool };
      const enrichment = normalizeOrcaPool(raw);
      return enrichment
        ? { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "matched", hasWarning: pool.hasWarning, enrichment }
        : { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "invalid_response", hasWarning: pool.hasWarning, message: "Pool address or variant mint did not match" };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown request error";
    return records.map((record) => ({ assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "request_failed", message }));
  }
}

async function main() {
  const inventory = JSON.parse(await readFile(resolve(process.cwd(), "reports/tokens-venue-inventory.json"), "utf8")) as { records: InventoryRecord[] };
  const records = inventory.records.filter((record) => /^Orca(?: |$)/i.test(record.venue?.name ?? ""));
  const queue = [...new Map(records.map((record) => [`${record.marketAddress}:${record.mint}`, record])).values()];
  const markets = new Map<string, InventoryRecord[]>();
  for (const record of queue) markets.set(record.marketAddress, [...(markets.get(record.marketAddress) ?? []), record]);
  const results: ProbeResult[] = [];
  let cursor = 0;
  for (const marketRecords of markets.values()) {
    results.push(...await fetchMarket(marketRecords));
    cursor += 1;
    console.log(`Probed ${cursor}/${markets.size} Orca markets`);
    if (cursor < markets.size) await new Promise((resolveDelay) => setTimeout(resolveDelay, REQUEST_INTERVAL_MS));
  }
  results.sort((a, b) => a.marketId.localeCompare(b.marketId) || a.mint.localeCompare(b.mint));
  const matched = results.filter((result) => result.status === "matched");
  const metricCoverage = Object.fromEntries(["tvl", "volume24h", "fees24h", "tickSpacing", "feeRateRaw", "hasWarning"].map((key) => [key,
    matched.filter((result) => result.enrichment?.metrics.some((metric) => metric.key === key)).length,
  ]));
  const summary = {
    generatedAt: new Date().toISOString(),
    tokensConfirmedMarketMints: queue.length,
    tokensConfirmedMarkets: new Set(queue.map((record) => record.marketAddress)).size,
    matched: matched.length,
    warningFlagged: matched.filter((result) => result.hasWarning).length,
    notFound: results.filter((result) => result.status === "not_found").length,
    invalidResponse: results.filter((result) => result.status === "invalid_response").length,
    requestFailed: results.filter((result) => result.status === "request_failed").length,
    metricCoverage,
  };
  await writeFile(resolve(process.cwd(), "reports/orca-enrichment-probe.json"), JSON.stringify({ summary, results }, null, 2));
  await writeFile(resolve(process.cwd(), "reports/orca-enrichment-probe.md"), `# Orca enrichment probe\n\nGenerated: ${summary.generatedAt}\n\nOnly exact Orca market addresses and variant mints already returned by Tokens.xyz were queried. No independent venue discovery, symbol matching, aggregation, ranking, or manual pool mapping was used.\n\n| Result | Count |\n|---|---:|\n| Tokens-confirmed market-mint pairs | ${summary.tokensConfirmedMarketMints} |\n| Tokens-confirmed unique markets | ${summary.tokensConfirmedMarkets} |\n| Matched by official Orca API | ${summary.matched} |\n| Matched pools carrying Orca's warning flag | ${summary.warningFlagged} |\n| Not returned by Orca | ${summary.notFound} |\n| Invalid or identity mismatch | ${summary.invalidResponse} |\n| Request failed | ${summary.requestFailed} |\n\n## Exact provider metric coverage\n\n| Metric | Matched pools reporting it |\n|---|---:|\n${Object.entries(metricCoverage).map(([key, count]) => `| ${key} | ${count} |`).join("\n")}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
