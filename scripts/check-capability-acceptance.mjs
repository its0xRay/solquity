import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_MAX_AGE_HOURS = 7 * 24;
const maxAgeHours = Number(process.env.CAPABILITY_ACCEPTANCE_MAX_AGE_HOURS ?? DEFAULT_MAX_AGE_HOURS);
if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("CAPABILITY_ACCEPTANCE_MAX_AGE_HOURS must be a positive number");

const path = resolve(process.cwd(), "reports/capability-acceptance.json");
const artifact = JSON.parse(await readFile(path, "utf8"));
const generatedAt = Date.parse(artifact.summary?.generatedAt ?? "");
if (!Number.isFinite(generatedAt)) throw new Error("Capability acceptance report has no valid generatedAt timestamp");

const ageHours = (Date.now() - generatedAt) / 3_600_000;
if (ageHours > maxAgeHours) {
  throw new Error(`Capability acceptance report is ${ageHours.toFixed(1)} hours old; maximum allowed age is ${maxAgeHours} hours. Run the capability audit before previewing or deploying.`);
}

console.log(`Capability acceptance report is ${ageHours.toFixed(1)} hours old (maximum ${maxAgeHours} hours).`);
