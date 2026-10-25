import { NextRequest, NextResponse } from "next/server";
import { issuerContent, type IssuerId } from "@/lib/issuer-content";
import { checkIssuerSources } from "@/lib/issuer-source-check";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(request:NextRequest) {
  const limited = enforceRateLimit(request,"issuer-sources",30);
  if (limited) return limited;
  const issuer = request.nextUrl.searchParams.get("issuer") ?? "";
  if (!Object.hasOwn(issuerContent,issuer)) return NextResponse.json({error:"Unknown issuer"},{status:400});
  const result = await checkIssuerSources(issuer as IssuerId);
  return NextResponse.json(result,{headers:{"Cache-Control":"public, max-age=300"}});
}
