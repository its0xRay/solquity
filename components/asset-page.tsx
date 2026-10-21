import { notFound } from "next/navigation";
import { CapabilityExplorer } from "./capability-explorer";
import { getAssetOverview } from "@/lib/tokens";
import { getCapabilityCoverage, preferredCapabilityMint } from "@/lib/capability-coverage";
import { clientAssets } from "@/lib/client-assets";
import { parseScenario } from "@/lib/scenario";
import { resolveVersion, type AssetQuery } from "@/lib/asset-url";
import { isTokensNotFoundError } from "@/lib/tokens-client";

export async function AssetPage({assetId, query, home = false}: {assetId: string; query: AssetQuery; home?: boolean}) {
  let detail;
  try { detail = await getAssetOverview(assetId); }
  catch (error) { if (isTokensNotFoundError(error)) notFound(); throw error; }
  const selected = resolveVersion(detail.variants, query);
  if (query.version && !selected) notFound();
  const coverage = getCapabilityCoverage();
  return <CapabilityExplorer key={assetId} assets={clientAssets([detail.asset])} capabilityCoverage={coverage} initialDetail={detail}
    initialMint={selected?.mint ?? preferredCapabilityMint(detail.asset, coverage)} initialScenario={parseScenario(query)} homeRoute={home} loadUniverse />;
}
