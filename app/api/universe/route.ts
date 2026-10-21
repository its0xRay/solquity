import { NextRequest, NextResponse } from "next/server";
import { getUniverse } from "@/lib/tokens";
import { clientAssets } from "@/lib/client-assets";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "universe", 60);
  if (limited) return limited;
  try { return NextResponse.json({assets: clientAssets(await getUniverse())}, {headers: {"Cache-Control":"public, max-age=120, stale-while-revalidate=300"}}); }
  catch { return NextResponse.json({error:"Asset data is temporarily unavailable."}, {status:503}); }
}
