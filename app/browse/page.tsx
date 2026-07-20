import { BrowseAssets } from "@/components/browse-assets";
import { getCapabilityCoverage } from "@/lib/capability-coverage";
import { getUniverse } from "@/lib/tokens";
import { clientAssets } from "@/lib/client-assets";

export default async function BrowsePage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const params = await searchParams;
  const initialType = params.type === "equity" || params.type === "etf" ? params.type : "all";
  return <BrowseAssets assets={clientAssets(await getUniverse())} capabilityCoverage={getCapabilityCoverage()} initialQuery={params.q ?? ""} initialType={initialType} />;
}
