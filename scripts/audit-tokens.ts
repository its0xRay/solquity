import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAssetAuditDetail, getUniverse } from "../lib/tokens";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
const concurrency = 6;
const assets = await getUniverse();
const rows: Array<Record<string, unknown>> = [];
let cursor = 0;
let completed = 0;

async function worker() {
  while (cursor < assets.length) {
    const asset = assets[cursor++];
    try {
      const detail = await getAssetAuditDetail(asset.assetId);
      const marketResults = Object.values(detail.marketResultsByMint);
      const successfulMarketResults = marketResults.filter((result) => result.status !== "failed");
      const riskResults = Object.values(detail.riskResultsByMint);
      const riskDetailResults = Object.values(detail.riskDetailResultsByMint);
      const descriptionResults = Object.values(detail.descriptionResultsByMint);
      rows.push({
        assetId: asset.assetId,
        category: asset.category,
        variants: detail.variants.length,
        mints: detail.variants.map((variant) => variant.mint),
        labels: detail.variants.map((variant) => variant.label ?? variant.issuer ?? null),
        marketRequestSuccesses: successfulMarketResults.length,
        marketRequestFailures: marketResults.filter((result) => result.status === "failed").length,
        successfulEmptyMarketResponses: successfulMarketResults.filter((result) => result.data.length === 0).length,
        markets: successfulMarketResults.reduce((sum, result) => sum + result.data.length, 0),
        riskRequestSuccesses: riskResults.filter((result) => result.status === "success").length,
        riskRequestFailures: riskResults.filter((result) => result.status === "failed").length,
        riskDetailRequestSuccesses: riskDetailResults.filter((result) => result.status !== "failed").length,
        riskDetailRequestFailures: riskDetailResults.filter((result) => result.status === "failed").length,
        descriptionRequestSuccesses: descriptionResults.filter((result) => result.status !== "failed").length,
        descriptionValues: descriptionResults.filter((result) => result.status !== "failed" && result.data.description != null).length,
        executionCovered: detail.variants.filter((variant) => variant.executionQuality?.executionScore != null).length,
        chartRequestStatus: detail.chartResult.status,
        canonicalCandles: detail.chartResult.status === "success" ? detail.chartResult.data.length : 0,
        error: null,
      });
    } catch (error) {
      rows.push({ assetId: asset.assetId, category: asset.category, error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      completed += 1;
      if (completed % 25 === 0 || completed === assets.length) console.log(`Audited ${completed}/${assets.length} assets`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
rows.sort((a, b) => String(a.assetId).localeCompare(String(b.assetId)));

const successful = rows.filter((row) => !row.error);
const summary = {
  generatedAt: new Date().toISOString(),
  assets: assets.length,
  successfulAssets: successful.length,
  failedAssets: rows.length - successful.length,
  variants: successful.reduce((sum, row) => sum + Number(row.variants ?? 0), 0),
  markets: successful.reduce((sum, row) => sum + Number(row.markets ?? 0), 0),
  successfulMarketRequests: successful.reduce((sum, row) => sum + Number(row.marketRequestSuccesses ?? 0), 0),
  failedMarketRequests: successful.reduce((sum, row) => sum + Number(row.marketRequestFailures ?? 0), 0),
  successfulEmptyMarketResponses: successful.reduce((sum, row) => sum + Number(row.successfulEmptyMarketResponses ?? 0), 0),
  successfulRiskRequests: successful.reduce((sum, row) => sum + Number(row.riskRequestSuccesses ?? 0), 0),
  failedRiskRequests: successful.reduce((sum, row) => sum + Number(row.riskRequestFailures ?? 0), 0),
  successfulChartRequests: successful.filter((row) => row.chartRequestStatus === "success").length,
  failedChartRequests: successful.filter((row) => row.chartRequestStatus === "failed").length,
  executionCoveredVariants: successful.reduce((sum, row) => sum + Number(row.executionCovered ?? 0), 0),
};

const outputDir = resolve(process.cwd(), "reports");
await import("node:fs/promises").then(({ mkdir }) => mkdir(outputDir, { recursive: true }));
const previous = await readFile(resolve(outputDir, "tokens-coverage.json"), "utf8").then((value) => JSON.parse(value).summary as typeof summary).catch(() => null);
const changes = previous ? {
  assets: summary.assets - previous.assets,
  variants: summary.variants - previous.variants,
  markets: summary.markets - previous.markets,
  failedMarketRequests: summary.failedMarketRequests - previous.failedMarketRequests,
  executionCoveredVariants: summary.executionCoveredVariants - previous.executionCoveredVariants,
} : null;
const artifact = { summary, changesSincePrevious: changes, assets: rows };
const historyDir = resolve(outputDir, "history");
await import("node:fs/promises").then(({ mkdir }) => mkdir(historyDir, { recursive: true }));
const historyStamp = summary.generatedAt.replaceAll(":", "-");
await writeFile(resolve(outputDir, "tokens-coverage.json"), JSON.stringify(artifact, null, 2));
await writeFile(resolve(historyDir, `${historyStamp}-tokens-coverage.json`), JSON.stringify(artifact, null, 2));
await writeFile(resolve(outputDir, "tokens-coverage.md"), `# Tokens.xyz coverage baseline\n\nGenerated: ${summary.generatedAt}\n\n| Measure | Count |\n|---|---:|\n| Assets | ${summary.assets} |\n| Successful asset probes | ${summary.successfulAssets} |\n| Failed asset probes | ${summary.failedAssets} |\n| Variants | ${summary.variants} |\n| Confirmed markets | ${summary.markets} |\n| Successful market requests | ${summary.successfulMarketRequests} |\n| Failed market requests | ${summary.failedMarketRequests} |\n| Successful empty market responses | ${summary.successfulEmptyMarketResponses} |\n| Successful risk requests | ${summary.successfulRiskRequests} |\n| Failed risk requests | ${summary.failedRiskRequests} |\n| Successful chart requests | ${summary.successfulChartRequests} |\n| Failed chart requests | ${summary.failedChartRequests} |\n| Variants with execution coverage | ${summary.executionCoveredVariants} |\n\n## Interpretation\n\n- Assets and variants are sourced only from Tokens.xyz.\n- Successful empty responses are distinguished from request failures.\n- External capabilities join to a Tokens variant by Solana mint.\n- Unsupported and failed sources remain internal states and are not rendered as capability rows.\n`);
console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
