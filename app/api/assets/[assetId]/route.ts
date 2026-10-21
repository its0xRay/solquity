import { NextRequest, NextResponse } from "next/server";
import { getAssetDetail, getAssetOverview, getVariantMints, getVariantRisk } from "@/lib/tokens";
import { log } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { publicAssetError } from "@/lib/public-api-error";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const limited = enforceRateLimit(_request, "asset-detail", 30);
  if (limited) return limited;
  const { assetId } = await context.params;
  try {
    const view = _request.nextUrl.searchParams.get("view");
    const mint = _request.nextUrl.searchParams.get("mint") ?? "";
    if (view === "overview") return NextResponse.json(await getAssetOverview(assetId));
    if (view === "risk" || view === "markets") {
      if (!mint || !(await getVariantMints(assetId)).includes(mint)) return NextResponse.json({error:"Mint does not belong to this asset"}, {status:404});
      return NextResponse.json(view === "risk" ? await getVariantRisk(assetId, mint) : await getAssetDetail(assetId, {mint, includeRisk:false}));
    }
    return NextResponse.json(await getAssetDetail(assetId));
  } catch (error) {
    log("error", "asset.route_failed", { assetId, message: error instanceof Error ? error.message : "Unknown error" });
    const failure = publicAssetError(error, "This asset is temporarily unavailable");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
