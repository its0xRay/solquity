import { NextRequest, NextResponse } from "next/server";
import { capabilityAdapters, getProtocolCapabilities } from "@/lib/protocol-capabilities";
import { sourceSuccess } from "@/lib/source-result";
import { getVariantMarkets, getVariantMints } from "@/lib/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { publicAssetError } from "@/lib/public-api-error";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "capabilities", 60);
  if (limited) return limited;
  const assetId = request.nextUrl.searchParams.get("asset")?.trim() ?? "";
  const mint = request.nextUrl.searchParams.get("mint")?.trim() ?? "";
  const provider = request.nextUrl.searchParams.get("provider");
  if (provider && provider !== "kamino" && provider !== "pools") return NextResponse.json({error:"Unknown provider group"}, {status:400});
  if (!assetId || !mint) return NextResponse.json({ error: "Asset and mint are required" }, { status: 400 });

  try {
    const knownMints = await getVariantMints(assetId);
    if (!knownMints.includes(mint)) return NextResponse.json({ error: "Mint does not belong to this asset" }, { status: 404 });
    const marketResult = provider === "kamino" ? sourceSuccess([]) : await getVariantMarkets(assetId, mint);
    const adapters = capabilityAdapters.filter(adapter => !provider || (provider === "kamino" ? adapter.id === "kamino" : adapter.id !== "kamino"));
    return NextResponse.json(await getProtocolCapabilities({ assetId, mint, knownMints, marketResult, adapters }));
  } catch (error) {
    const failure = publicAssetError(error, "Capability providers are temporarily unavailable");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
