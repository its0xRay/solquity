import { createHash } from "node:crypto";
import baseline from "../reports/issuer-source-baseline.json";
import { issuerContent, type IssuerId, type IssuerSource } from "./issuer-content";

export type SourceCheck = {id:string; status:"unchanged" | "changed" | "unavailable" | "unreviewed"; checkedAt:number; reviewedAt:string; contentHash?:string};
export type IssuerChecks = {issuer:IssuerId; checks:SourceCheck[]; checkedAt:number};
type Baseline = Record<string,{hash:string;reviewedAt:string}>;
const approved = baseline as Baseline;
const cache = new Map<IssuerId,IssuerChecks>();
const pending = new Map<IssuerId,Promise<IssuerChecks>>();
export const SOURCE_CHECK_TTL_MS = 24 * 60 * 60_000;

export function sourceText(html:string) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? html;
  return main.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g,entity => ({"&nbsp;":" ","&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">"}[entity]!))
    .replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,hex,decimal) => {const value = parseInt(hex ?? decimal,hex ? 16 : 10);return value <= 0x10ffff ? String.fromCodePoint(value) : " ";})
    .replace(/\s+/g," ").replace(/Last updated (?:\d+|an?|one) (?:second|minute|hour|day|week|month|year)s? ago/gi,"").trim();
}

export async function checkSource(source:IssuerSource, reviewedAt:string, fetcher:typeof fetch = fetch):Promise<SourceCheck> {
  const checkedAt = Date.now();
  try {
    // URLs come only from our fixed registry; never accept a visitor-supplied URL.
    const response = await fetcher(source.url,{signal:AbortSignal.timeout(6000),redirect:"error",cache:"no-store",headers:{"User-Agent":"Solquity-source-check/1.0"}});
    if (!response.ok) throw new Error("Source unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Source unavailable");
    const chunks:Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8_000_000) throw new Error("Source too large");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const text = sourceText(Buffer.concat(chunks).toString("utf8"));
    if (text.length < 300 || /verify you are human|just a moment|access denied/i.test(text.slice(0,500))) throw new Error("Source unavailable");
    const contentHash = createHash("sha256").update(text).digest("hex");
    const saved = approved[source.id];
    return {id:source.id,status:!saved ? "unreviewed" : saved.hash === contentHash ? "unchanged" : "changed",checkedAt,reviewedAt:saved?.reviewedAt ?? reviewedAt,contentHash};
  } catch { return {id:source.id,status:"unavailable",checkedAt,reviewedAt:approved[source.id]?.reviewedAt ?? reviewedAt}; }
}

export async function checkIssuerSources(issuer:IssuerId, force = false):Promise<IssuerChecks> {
  const previous = cache.get(issuer);
  const ttl = previous?.checks.some(check => check.status === "unavailable") ? 15 * 60_000 : SOURCE_CHECK_TTL_MS;
  if (!force && previous && Date.now() - previous.checkedAt < ttl) return previous;
  const existing = pending.get(issuer);
  if (existing) return existing;
  const content = issuerContent[issuer];
  const request = Promise.all(content.sources.map(source => checkSource(source,content.reviewedAt)))
    .then(checks => {const result = {issuer,checks,checkedAt:Date.now()};cache.set(issuer,result);return result;})
    .finally(() => pending.delete(issuer));
  pending.set(issuer,request);
  return request;
}
