import { CapabilityExplorer } from "@/components/capability-explorer";
import { defaultCapabilityAsset, getCapabilityCoverage, preferredCapabilityMint } from "@/lib/capability-coverage";
import { getAssetDetail, getUniverse } from "@/lib/tokens";
import { clientAssets } from "@/lib/client-assets";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string; mint?: string }>;
}) {
  const assets = await getUniverse();
  const capabilityCoverage = getCapabilityCoverage();
  const requested = await searchParams;
  const defaultAsset = defaultCapabilityAsset(assets, capabilityCoverage);
  const requestedAsset = requested.asset ? assets.find((asset) => asset.assetId === requested.asset) : undefined;
  const preferredId = requested.asset ? requestedAsset?.assetId : defaultAsset?.assetId;
  let initialDetail = null;
  let initialError: string | null = requested.asset && !requestedAsset ? "This asset could not be loaded." : null;
  if (preferredId) {
    try {
      initialDetail = await getAssetDetail(preferredId);
    } catch {
      initialError = requested.asset ? "This asset could not be loaded." : "Asset data is temporarily unavailable.";
    }
  }

  const initialAsset = assets.find((asset) => asset.assetId === preferredId) ?? defaultAsset;
  return <CapabilityExplorer assets={clientAssets(assets)} capabilityCoverage={capabilityCoverage} initialDetail={initialDetail} initialMint={requested.mint ?? (initialAsset ? preferredCapabilityMint(initialAsset, capabilityCoverage) : undefined)} initialError={initialError} />;
}
