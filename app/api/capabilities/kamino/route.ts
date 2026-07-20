import { NextRequest, NextResponse } from "next/server";
import { kaminoAdapter } from "@/lib/adapters/kamino";
import { aggregateDisplayCapabilities } from "@/lib/capabilities";
import { getVariantMints } from "@/lib/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "kamino-capabilities", 60);
  if (limited) return limited;
  const assetId = request.nextUrl.searchParams.get("asset")?.trim() ?? "";
  const mint = request.nextUrl.searchParams.get("mint")?.trim() ?? "";
  if (!assetId || !mint) return NextResponse.json({ error: "Asset and mint are required" }, { status: 400 });
  try {
    const knownMints = await getVariantMints(assetId);
    if (!knownMints.includes(mint)) return NextResponse.json({ error: "Mint does not belong to this asset" }, { status: 404 });
    const result = await kaminoAdapter.capabilities({ assetId, mint, now: Date.now() });
    if (result.status === "failed") return NextResponse.json(result, { status: 502 });
    const capabilities = aggregateDisplayCapabilities({ knownMints, batches: [{ provider: "Kamino", result }], now: Date.now() }).capabilities;
    return NextResponse.json({ ...result, data: capabilities });
  } catch {
    return NextResponse.json({ error: "Kamino capability check failed" }, { status: 502 });
  }
}
