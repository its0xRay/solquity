import { notFound } from "next/navigation";
import { AssetPage } from "@/components/asset-page";
import type { AssetQuery } from "@/lib/asset-url";

export default async function StockPage({params, searchParams}: {
  params: Promise<{assetId: string; action?: string[]}>; searchParams: Promise<AssetQuery>;
}) {
  const [route, query] = await Promise.all([params, searchParams]);
  const mode = route.action?.[0];
  if (route.action && (route.action.length !== 1 || mode !== "lend" && mode !== "borrow")) notFound();
  return <AssetPage assetId={route.assetId} query={{...query, ...(mode ? {mode} : {})}} />;
}
