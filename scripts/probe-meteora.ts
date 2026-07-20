import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RawEnrichmentEnvelope } from "../lib/enrichment";
import { MeteoraPool, MeteoraPoolFamily, meteoraPoolSchema, normalizeMeteoraPool } from "../lib/adapters/meteora";

type InventoryRecord = { assetId: string; mint: string; marketAddress: string; venue?: { name?: string } | null };
type ProbeResult = { assetId: string; mint: string; marketId: string; status: "matched" | "not_found" | "invalid_response" | "request_failed"; family?: MeteoraPoolFamily; enrichment?: ReturnType<typeof normalizeMeteoraPool>; message?: string };

const BASES: Array<{ family: MeteoraPoolFamily; url: string }> = [
  { family: "dlmm", url: "https://dlmm.datapi.meteora.ag/pools" },
  { family: "damm-v2", url: "https://damm-v2.datapi.meteora.ag/pools" },
];

async function fetchPool(base: string, address: string) {
  const response = await fetch(`${base}/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(8_000) });
  if (response.status === 404) return { kind: "not_found" as const };
  if (!response.ok) return { kind: "request_failed" as const, message: `HTTP ${response.status}` };
  const parsed = meteoraPoolSchema.safeParse(await response.json());
  return parsed.success ? { kind: "success" as const, pool: parsed.data } : { kind: "invalid_response" as const, message: parsed.error.issues.slice(0, 3).map((issue) => issue.message).join("; ") };
}

async function probe(record: InventoryRecord): Promise<ProbeResult> {
  for (const base of BASES) {
    try {
      const result = await fetchPool(base.url, record.marketAddress);
      if (result.kind === "not_found") continue;
      if (result.kind !== "success") return { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: result.kind, family: base.family, message: result.message };
      const rejection = result.pool.is_blacklisted === true
        ? "Pool is blacklisted by Meteora"
        : result.pool.address !== record.marketAddress
          ? "Meteora pool address did not match the Tokens market"
          : result.pool.token_x.address !== record.mint && result.pool.token_y.address !== record.mint
            ? "Meteora pool token mints did not include the Tokens variant mint"
            : null;
      if (rejection) return { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "invalid_response", family: base.family, message: rejection };
      const fetchedAt = Date.now();
      const raw: RawEnrichmentEnvelope<MeteoraPool> = { provider: "Meteora", marketId: record.marketAddress, mint: record.mint, fetchedAt, payload: result.pool };
      const enrichment = normalizeMeteoraPool(raw, base.family);
      return enrichment
        ? { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "matched", family: base.family, enrichment }
        : { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "invalid_response", family: base.family, message: "Pool failed production normalization" };
    } catch (error) {
      return { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "request_failed", family: base.family, message: error instanceof Error ? error.message : "Unknown request error" };
    }
  }
  return { assetId: record.assetId, mint: record.mint, marketId: record.marketAddress, status: "not_found" };
}

async function main() {
  const inventory = JSON.parse(await readFile(resolve(process.cwd(), "reports/tokens-venue-inventory.json"), "utf8")) as { records: InventoryRecord[] };
  const records = inventory.records.filter((record) => /^Meteora(?: |$)/i.test(record.venue?.name ?? ""));
  const exactMarketMints = new Map(records.map((record) => [`${record.marketAddress}:${record.mint}`, record]));
  const queue = [...exactMarketMints.values()];
  const results: ProbeResult[] = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < queue.length) {
      const record = queue[cursor++];
      results.push(await probe(record));
      completed += 1;
      if (completed % 25 === 0 || completed === queue.length) console.log(`Probed ${completed}/${queue.length} Meteora markets`);
    }
  }

  await Promise.all(Array.from({ length: 10 }, worker));
  results.sort((a, b) => a.marketId.localeCompare(b.marketId));
  const summary = {
    generatedAt: new Date().toISOString(),
    tokensConfirmedMarketMints: queue.length,
    tokensConfirmedMarkets: new Set(queue.map((record) => record.marketAddress)).size,
    matched: results.filter((result) => result.status === "matched").length,
    dlmm: results.filter((result) => result.status === "matched" && result.family === "dlmm").length,
    dammV2: results.filter((result) => result.status === "matched" && result.family === "damm-v2").length,
    notFound: results.filter((result) => result.status === "not_found").length,
    invalidResponse: results.filter((result) => result.status === "invalid_response").length,
    requestFailed: results.filter((result) => result.status === "request_failed").length,
  };
  await writeFile(resolve(process.cwd(), "reports/meteora-enrichment-probe.json"), JSON.stringify({ summary, results }, null, 2));
  await writeFile(resolve(process.cwd(), "reports/meteora-enrichment-probe.md"), `# Meteora enrichment probe\n\nGenerated: ${summary.generatedAt}\n\nOnly exact Meteora market addresses and variant mints already returned by Tokens.xyz were probed. No independent venue discovery or manual pool mapping was used.\n\n| Result | Count |\n|---|---:|\n| Tokens-confirmed market–mint pairs | ${summary.tokensConfirmedMarketMints} |\n| Tokens-confirmed unique markets | ${summary.tokensConfirmedMarkets} |\n| Matched by official Meteora API | ${summary.matched} |\n| DLMM | ${summary.dlmm} |\n| DAMM v2 | ${summary.dammV2} |\n| Not found in either documented API | ${summary.notFound} |\n| Invalid, blacklisted, or identity mismatch | ${summary.invalidResponse} |\n| Request failed | ${summary.requestFailed} |\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
