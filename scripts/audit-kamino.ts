import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { kaminoAdapter } from "../lib/adapters/kamino";

type Coverage = { assets: Array<{ assetId: string; category: string; mints?: string[]; labels?: Array<string | null> }> };

async function main() {
  const coverage = JSON.parse(await readFile(resolve(process.cwd(), "reports/tokens-coverage.json"), "utf8")) as Coverage;
  const owners = new Map<string, { assetId: string; category: string; label: string | null }>();
  for (const asset of coverage.assets) (asset.mints ?? []).forEach((mint, index) => owners.set(mint, {
    assetId: asset.assetId, category: asset.category, label: asset.labels?.[index] ?? null,
  }));
  const discovered = await kaminoAdapter.discover([...owners.keys()]);
  if (discovered.status === "failed") throw new Error(discovered.error.message);
  const rows = [];
  for (const mint of discovered.data) {
    const owner = owners.get(mint);
    if (!owner) continue;
    const capabilities = await kaminoAdapter.capabilities({ assetId: owner.assetId, mint, now: Date.now() });
    if (capabilities.status === "failed") continue;
    rows.push({ ...owner, mint, capabilities: capabilities.data });
  }
  const generatedAt = new Date().toISOString();
  const artifact = { generatedAt, tokensMints: owners.size, exactMatches: rows.length, assets: rows };
  const outputDir = resolve(process.cwd(), "reports");
  const historyDir = resolve(outputDir, "history");
  await mkdir(historyDir, { recursive: true });
  await writeFile(resolve(outputDir, "kamino-coverage.json"), JSON.stringify(artifact, null, 2));
  await writeFile(resolve(outputDir, "kamino-coverage.md"), `# Kamino exact-mint coverage\n\nGenerated: ${generatedAt}\n\n| Measure | Count |\n|---|---:|\n| Tokens variants checked | ${owners.size} |\n| Exact Kamino reserve matches | ${rows.length} |\n\n${rows.map((row) => `- ${row.assetId} · ${row.label ?? "variant"} · ${row.mint}`).join("\n")}\n`);
  await writeFile(resolve(historyDir, `${generatedAt.replaceAll(":", "-")}-kamino-coverage.json`), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ generatedAt, tokensMints: owners.size, exactMatches: rows.length, assets: rows.map((row) => row.assetId) }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
