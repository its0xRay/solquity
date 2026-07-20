import { NextRequest, NextResponse } from "next/server";
import { searchUniverse } from "@/lib/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "search", 60);
  if (limited) return limited;
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchUniverse(query) });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable" }, { status: 502 });
  }
}
