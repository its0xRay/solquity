import { NextRequest, NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
type Bucket = { count: number; resetsAt: number };
const buckets = new Map<string, Bucket>();

function clientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function checkRateLimit(key: string, limit: number, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetsAt - now) / 1_000));
  return { allowed: current.count <= limit, retryAfterSeconds };
}

export function enforceRateLimit(request: NextRequest, scope: string, limit: number) {
  const key = `${scope}:${clientAddress(request)}`;
  if (buckets.size >= MAX_BUCKETS) {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetsAt <= now) buckets.delete(key);
    if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }
  const result = checkRateLimit(key, limit);
  if (result.allowed) return null;
  return NextResponse.json({ error: "Too many requests. Try again shortly." }, {
    status: 429,
    headers: { "Retry-After": String(result.retryAfterSeconds) },
  });
}
