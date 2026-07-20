import { NextRequest, NextResponse } from "next/server";
import { getAssetDetail } from "@/lib/tokens";
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
    return NextResponse.json(await getAssetDetail(assetId));
  } catch (error) {
    log("error", "asset.route_failed", { assetId, message: error instanceof Error ? error.message : "Unknown error" });
    const failure = publicAssetError(error, "This asset is temporarily unavailable");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
