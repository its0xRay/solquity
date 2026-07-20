import { NextRequest, NextResponse } from "next/server";
import { getProtocolCapabilities } from "@/lib/protocol-capabilities";
import { getVariantMarkets, getVariantMints } from "@/lib/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { publicAssetError } from "@/lib/public-api-error";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "capabilities", 60);
  if (limited) return limited;
  const assetId = request.nextUrl.searchParams.get("asset")?.trim() ?? "";
  const mint = request.nextUrl.searchParams.get("mint")?.trim() ?? "";
  if (!assetId || !mint) return NextResponse.json({ error: "Asset and mint are required" }, { status: 400 });

  try {
    const knownMints = await getVariantMints(assetId);
    if (!knownMints.includes(mint)) return NextResponse.json({ error: "Mint does not belong to this asset" }, { status: 404 });
    const marketResult = await getVariantMarkets(assetId, mint);
    return NextResponse.json(await getProtocolCapabilities({ assetId, mint, knownMints, marketResult }));
  } catch (error) {
    const failure = publicAssetError(error, "Capability providers are temporarily unavailable");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
