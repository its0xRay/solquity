"use client";

/* Tokens.xyz returns dynamic third-party logo hosts, so native images are used with fixed dimensions. */
/* eslint-disable @next/next/no-img-element */

import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { preferredCapabilityMint, type CapabilityCoverageIndex, type VisibleCapabilityKind } from "@/lib/capability-coverage";
import type { Asset } from "@/lib/types";

type AssetType = "all" | "equity" | "etf";

const capabilityLabels: Record<VisibleCapabilityKind, string> = {
  trade: "Trade 24/7",
  earn: "Lend",
  borrow: "Borrow",
  liquidity: "Trading pools",
};

export function BrowseAssets({ assets, capabilityCoverage, initialQuery = "", initialType = "all" }: { assets: Asset[]; capabilityCoverage: CapabilityCoverageIndex; initialQuery?: string; initialType?: AssetType }) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<AssetType>(initialType);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesType = type === "all" || asset.category === type;
      const matchesQuery = !needle || [asset.name, asset.symbol, asset.primaryVariant?.issuer, asset.primaryVariant?.label,
        ...(asset.variants ?? []).flatMap((variant) => [variant.issuer, variant.label, variant.symbol])]
        .filter(Boolean).some((item) => String(item).toLowerCase().includes(needle));
      return matchesType && matchesQuery;
    });
  }, [assets, query, type]);

  function updateUrl(nextQuery: string, nextType: AssetType) {
    const url = new URL(window.location.href);
    if (nextQuery.trim()) url.searchParams.set("q", nextQuery);
    else url.searchParams.delete("q");
    if (nextType === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", nextType);
    window.history.replaceState(null, "", url);
  }

  function updateQuery(value: string) {
    setQuery(value);
    updateUrl(value, type);
  }

  function updateType(value: AssetType) {
    setType(value);
    updateUrl(query, value);
  }

  return (
    <main className="browse-shell">
      <header className="browse-header"><Link href="/"><ArrowLeft size={16} aria-hidden="true" /> Solquity</Link><span>Stocks and ETFs on Solana</span></header>
      <section className="browse-intro"><p className="eyebrow">Browse</p><h1>Find what your stock can do</h1><label className="search-field"><Search size={19} aria-hidden="true" /><span className="sr-only">Search all assets</span><input type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search by name or ticker…" autoComplete="off" /></label></section>
      <div className="browse-controls" role="group" aria-label="Asset type">
        {([['all','All'],['equity','Stocks'],['etf','ETFs']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={type === value} onClick={() => updateType(value)}>{label}</button>)}
        <span>{filtered.length} results</span>
      </div>
      {filtered.length ? <div className="browse-grid">{filtered.map((asset) => {
        const preferredMint = preferredCapabilityMint(asset, capabilityCoverage);
        const capabilities = preferredMint ? capabilityCoverage.byMint[preferredMint] ?? [] : [];
        return <Link key={asset.assetId} href={`/?asset=${encodeURIComponent(asset.assetId)}${preferredMint ? `&mint=${encodeURIComponent(preferredMint)}` : ""}`}>
          {asset.imageUrl ? <img src={asset.imageUrl} alt="" width="44" height="44" loading="lazy" decoding="async" /> : <span className="logo-fallback">{(asset.symbol ?? "?").slice(0,2)}</span>}
          <span><strong>{asset.name}</strong><small>{asset.symbol} · {asset.category === "etf" ? "ETF" : "Stock"}</small></span>
          <span className="browse-capabilities">{capabilities.length
            ? capabilities.map((kind) => <small key={kind}>{capabilityLabels[kind]}</small>)
            : <small>No verified actions yet</small>}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      })}</div> : <div className="empty-state"><strong>No matching assets</strong><p>Try another company name, ticker, or asset type.</p></div>}
    </main>
  );
}
