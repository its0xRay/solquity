import { AssetPage } from "@/components/asset-page";
import type { AssetQuery } from "@/lib/asset-url";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<AssetQuery>;
}) {
  const requested = await searchParams;
  return <AssetPage assetId={requested.asset ?? "tesla"} query={requested} home />;
}
