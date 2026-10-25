import { writeFile } from "node:fs/promises";
import { issuerContent, type IssuerId } from "../lib/issuer-content";
import { checkIssuerSources } from "../lib/issuer-source-check";

async function main() {
const results = await Promise.all((Object.keys(issuerContent) as IssuerId[]).map(issuer => checkIssuerSources(issuer,true)));
for (const result of results) for (const check of result.checks) console.log(`${result.issuer}/${check.id}: ${check.status}`);
const record = process.argv.includes("--record-reviewed-baseline");
if (record) {
  if (results.some(result => result.checks.some(check => !check.contentHash))) throw new Error("Cannot record an incomplete baseline");
  const approved = Object.fromEntries(results.flatMap(result => result.checks.map(check => [check.id,{hash:check.contentHash,reviewedAt:issuerContent[result.issuer].reviewedAt}])));
  await writeFile(new URL("../reports/issuer-source-baseline.json",import.meta.url),`${JSON.stringify(approved,null,2)}\n`);
  console.log("Recorded source fingerprints. Editorial review dates were not advanced.");
} else {
  await writeFile(new URL("../reports/issuer-source-status.json",import.meta.url),`${JSON.stringify(results,null,2)}\n`);
  if (results.some(result => result.checks.some(check => check.status !== "unchanged"))) process.exitCode = 1;
}
}
main().catch(() => {console.error("Issuer source check could not complete.");process.exitCode = 1;});
