"use client";

/* Tokens.xyz returns dynamic third-party logo hosts, so native images are used with fixed dimensions. */
/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight,
  ArrowUpRight,
  CircleDollarSign,
  ChevronDown,
  ExternalLink,
  LockKeyhole,
  Waves,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { featuredAssets, preferredCapabilityMint, type CapabilityCoverageIndex } from "@/lib/capability-coverage";
import type { Asset, AssetDetail, CapabilityRecord, ProtocolCapabilityResponse, RiskSummary, Variant, VenueMarket } from "@/lib/types";
import { DetailCacheEntry, isDetailCacheFresh } from "@/lib/detail-cache";
import { isProtocolCacheFresh, ProtocolCacheEntry } from "@/lib/protocol-cache";
import { referenceSession } from "@/lib/reference-session";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function compactValue(value: number) {
  const absolute = Math.abs(value);
  const units = [
    { threshold: 1e9, suffix: "B" },
    { threshold: 1e6, suffix: "M" },
    { threshold: 1e3, suffix: "K" },
  ];
  const unit = units.find((candidate) => absolute >= candidate.threshold);
  if (!unit) return Math.round(value).toLocaleString("en-US");
  const scaled = value / unit.threshold;
  const digits = Math.abs(scaled) >= 100 ? 0 : 1;
  return `${scaled.toFixed(digits).replace(/\.0$/, "")}${unit.suffix}`;
}

function compactMoney(value: number) {
  return `$${compactValue(value)}`;
}

function percentage(value?: number | null, digits = 2) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function relativeTime(timestamp?: number | null) {
  if (!timestamp) return null;
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function structureCopy(tier?: Variant["stockVariantTier"]) {
  switch (tier) {
    case "share_redeemable":
      return { label: "Redeems for shares", tone: "positive", note: "If redeemed, this version provides a path to the corresponding share entitlement." };
    case "cash_redeemable":
      return { label: "Redeems for cash", tone: "warning", note: "If redeemed, this version settles for cash or equivalent value, not company shares." };
    case "not_redeemable":
      return { label: "Not redeemable now", tone: "negative", note: "No redemption option is currently verified for this version." };
    default:
      return { label: "Redemption unknown", tone: "neutral", note: "Redemption terms are not currently available for this version." };
  }
}

function issuerPresentation(variant: Variant) {
  const label = variant.label ?? variant.issuer ?? "Version";
  const identity = `${label} ${variant.issuer ?? ""} ${variant.issuerUrl ?? ""}`.toLocaleLowerCase();

  if (identity.includes("backpack")) return { label: "Backpack", logo: "/issuers/backpack.png", id: "backpack" };
  if (identity.includes("xstock")) return { label: "xStock", logo: "/issuers/xstocks.svg", id: "xstocks" };
  if (identity.includes("ondo")) return { label: "Ondo", logo: "/issuers/ondo.svg", id: "ondo" };
  return { label, logo: null, id: "other" };
}

function venueName(market: VenueMarket) {
  const source = market.source ?? "Solana market";
  const labels: Record<string, string> = {
    "raydium clamm": "Raydium",
    "meteora dlmm": "Meteora",
    "meteora damm v2": "Meteora",
    "goonfi v2": "GoonFi",
    "zerofi": "ZeroFi",
  };
  return labels[source.toLocaleLowerCase()] ?? source;
}

function displayedMarketMetric(market: VenueMarket) {
  if (market.volume24h != null) return { value: compactMoney(market.volume24h), label: "24h volume" };
  if (market.liquidity != null) return { value: compactMoney(market.liquidity), label: "liquidity" };
  return { value: "Not reported", label: "market metric" };
}

function riskScore(summary?: RiskSummary | null) {
  return summary?.risk?.marketScore ?? null;
}

function humanList(items: string[]) {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function capabilityConclusion(assetName: string, available: { trade: boolean; earn: boolean; borrow: boolean; liquidity: boolean }) {
  const actions = [
    available.trade ? "trade 24/7" : null,
    available.earn ? "earn lending yield" : null,
    available.borrow ? "borrow against it" : null,
    available.liquidity ? "earn trading fees" : null,
  ].filter((action): action is string => Boolean(action));
  return actions.length ? `This version of ${assetName} lets you ${humanList(actions)}.` : null;
}

type ExplorerProps = { assets: Asset[]; capabilityCoverage: CapabilityCoverageIndex; initialDetail: AssetDetail | null; initialMint?: string; initialError?: string | null };
type CapabilityMapPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "middle-left" | "middle-right";
type CapabilityPresentation = {
  id: "trade" | "earn" | "borrow" | "liquidity";
  position: CapabilityMapPosition;
  icon: React.ReactNode;
  title: string;
  summary: string;
  mapSummary: string;
  detail: React.ReactNode;
};

const capabilityMapLayouts: Record<number, readonly CapabilityMapPosition[]> = {
  0: [],
  1: ["middle-left"],
  2: ["middle-left", "middle-right"],
  3: ["middle-left", "top-right", "bottom-right"],
  4: ["top-left", "top-right", "bottom-left", "bottom-right"],
};

const capabilityMapEndpoints: Record<CapabilityMapPosition, { x: string; y: string }> = {
  "top-left": { x: "23", y: "25" },
  "top-right": { x: "77", y: "25" },
  "bottom-left": { x: "23", y: "75" },
  "bottom-right": { x: "77", y: "75" },
  "middle-left": { x: "23", y: "50" },
  "middle-right": { x: "77", y: "50" },
};

export function CapabilityExplorer({ assets, capabilityCoverage, initialDetail, initialMint, initialError = null }: ExplorerProps) {
  const initialSelectedMint = initialDetail?.variants.some((variant) => variant.mint === initialMint)
    ? initialMint ?? ""
    : initialDetail?.variants[0]?.mint ?? "";
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [detail, setDetail] = useState(initialDetail);
  const [selectedMint, setSelectedMint] = useState(initialSelectedMint);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previewedCapability, setPreviewedCapability] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [clock, setClock] = useState(() => Date.now());
  const cache = useRef(new Map<string, DetailCacheEntry>(
    initialDetail ? [[initialDetail.asset.assetId, { detail: initialDetail, cachedAt: initialDetail.fetchedAt }]] : [],
  ));
  const requestSequence = useRef(0);
  const searchDialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const featuredRail = useRef<HTMLDivElement>(null);
  const stageScroll = useRef<HTMLElement>(null);
  const capabilityRequests = useRef(new Set<string>());
  const [protocolCapabilitiesByMint, setProtocolCapabilitiesByMint] = useState<Record<string, ProtocolCacheEntry>>({});
  const [capabilityErrorsByMint, setCapabilityErrorsByMint] = useState<Record<string, boolean>>({});

  const suggestions = searchResults;

  const featured = useMemo(() => featuredAssets(assets, capabilityCoverage), [assets, capabilityCoverage]);
  const selectedVariant = detail?.variants.find((variant) => variant.mint === selectedMint) ?? detail?.variants[0];
  const markets = selectedVariant ? detail?.displayMarketsByMint[selectedVariant.mint] ?? [] : [];
  const confirmedCapabilities = selectedVariant ? detail?.displayCapabilitiesByMint[selectedVariant.mint] ?? [] : [];
  const canTrade = confirmedCapabilities.some((capability) => capability.kind === "trade");
  const selectedProtocolEntry = selectedVariant ? protocolCapabilitiesByMint[selectedVariant.mint] : undefined;
  const selectedProtocolCapabilities = selectedProtocolEntry?.response;
  const externalCapabilities = selectedProtocolCapabilities?.capabilities ?? [];
  const earnCapabilities = externalCapabilities.filter((capability) => capability.kind === "earn");
  const borrowCapabilities = externalCapabilities.filter((capability) => capability.kind === "borrow");
  const liquidityCapabilities = externalCapabilities.filter((capability) => capability.kind === "liquidity");
  const kaminoState = selectedProtocolCapabilities?.providers.kamino;
  const meteoraState = selectedProtocolCapabilities?.providers.meteora;
  const capabilityRequestFailed = selectedVariant ? capabilityErrorsByMint[selectedVariant.mint] : false;
  const selectedRiskResult = selectedVariant ? detail?.riskResultsByMint[selectedVariant.mint] : undefined;
  const selectedRisk = riskScore(selectedRiskResult?.status !== "failed" ? selectedRiskResult?.data : null);
  const selectedMarketResult = selectedVariant ? detail?.marketResultsByMint[selectedVariant.mint] : undefined;
  const session = referenceSession(new Date(clock));
  const hasReferenceMarket = Boolean(detail?.asset.canonicalMarket);
  const capabilitySentence = detail ? capabilityConclusion(detail.asset.name ?? "This asset", {
    trade: canTrade,
    earn: earnCapabilities.length > 0,
    borrow: borrowCapabilities.length > 0,
    liquidity: liquidityCapabilities.length > 0,
  }) : null;
  const availableCapabilityIds = [
    canTrade ? "trade" : null,
    earnCapabilities.length ? "earn" : null,
    borrowCapabilities.length ? "borrow" : null,
    liquidityCapabilities.length ? "liquidity" : null,
  ].filter((id): id is string => Boolean(id));
  const mapActiveCapability = previewedCapability
    ?? (expanded && availableCapabilityIds.includes(expanded) ? expanded : null)
    ?? null;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const rail = featuredRail.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motionAllowed = !reducedMotion.matches;
    let frame = 0;
    let lastFrame = performance.now();
    let pauseUntil = lastFrame + 200;
    let direction = 1;
    let autoPosition = rail.scrollLeft;
    let focusPaused = false;

    const pauseFor = (duration: number) => {
      pauseUntil = performance.now() + duration;
    };
    const slowHorizontalScroll = (event: WheelEvent) => {
      if (rail.scrollWidth <= rail.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      pauseFor(1_800);
      rail.scrollLeft += delta * 0.34;
      autoPosition = rail.scrollLeft;
    };
    const handleFocusIn = () => { focusPaused = true; };
    const handleFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && rail.contains(event.relatedTarget)) return;
      focusPaused = false;
      pauseFor(700);
    };
    const handleDirectInteraction = () => pauseFor(1_800);
    const handleMotionPreference = (event: MediaQueryListEvent) => { motionAllowed = !event.matches; };
    const animate = (now: number) => {
      const elapsed = Math.min(now - lastFrame, 50);
      lastFrame = now;
      const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth);
      if (motionAllowed && !focusPaused && maximum > 0 && document.visibilityState === "visible" && now >= pauseUntil) {
        autoPosition += direction * 24 * (elapsed / 1_000);
        rail.scrollLeft = autoPosition;
        if (autoPosition >= maximum - 0.5) {
          autoPosition = maximum;
          rail.scrollLeft = autoPosition;
          direction = -1;
          pauseFor(900);
        } else if (autoPosition <= 0.5) {
          autoPosition = 0;
          rail.scrollLeft = autoPosition;
          direction = 1;
          pauseFor(900);
        }
      } else {
        autoPosition = rail.scrollLeft;
      }
      frame = window.requestAnimationFrame(animate);
    };

    rail.addEventListener("wheel", slowHorizontalScroll, { passive: false });
    rail.addEventListener("pointerdown", handleDirectInteraction);
    rail.addEventListener("touchstart", handleDirectInteraction, { passive: true });
    rail.addEventListener("focusin", handleFocusIn);
    rail.addEventListener("focusout", handleFocusOut);
    rail.addEventListener("keydown", handleDirectInteraction);
    reducedMotion.addEventListener("change", handleMotionPreference);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      rail.removeEventListener("wheel", slowHorizontalScroll);
      rail.removeEventListener("pointerdown", handleDirectInteraction);
      rail.removeEventListener("touchstart", handleDirectInteraction);
      rail.removeEventListener("focusin", handleFocusIn);
      rail.removeEventListener("focusout", handleFocusOut);
      rail.removeEventListener("keydown", handleDirectInteraction);
      reducedMotion.removeEventListener("change", handleMotionPreference);
    };
  }, [featured]);

  useEffect(() => {
    const needle = query.trim();
    if (!needle) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true); setSearchError(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const data = await response.json() as { results: Asset[] };
        setSearchResults(data.results);
        setActiveSuggestion(-1);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const dialog = searchDialog.current;
    if (!dialog) return;
    if (searchDialogOpen && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => searchInput.current?.focus());
    } else if (!searchDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [searchDialogOpen]);

  useEffect(() => {
    if (!detail || !selectedVariant || isProtocolCacheFresh(protocolCapabilitiesByMint[selectedVariant.mint], clock) || capabilityRequests.current.has(selectedVariant.mint)) return;
    const mint = selectedVariant.mint;
    const controller = new AbortController();
    capabilityRequests.current.add(mint);
    fetch(`/api/capabilities?asset=${encodeURIComponent(detail.asset.assetId)}&mint=${encodeURIComponent(mint)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ProtocolCapabilityResponse | { error: string };
        if ("capabilities" in data) return data;
        throw new Error(data.error);
      })
      .then((result) => {
        setProtocolCapabilitiesByMint((current) => ({ ...current, [mint]: { response: result, cachedAt: Date.now() } }));
        setCapabilityErrorsByMint((current) => ({ ...current, [mint]: false }));
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setCapabilityErrorsByMint((current) => ({ ...current, [mint]: true }));
      })
      .finally(() => capabilityRequests.current.delete(mint));
    return () => controller.abort();
  }, [clock, detail, selectedVariant, protocolCapabilitiesByMint]);

  function updateQuery(value: string) {
    setQuery(value);
    setSearchResults([]);
    setSearchError(false);
    setSearchLoading(Boolean(value.trim()));
    setSearchOpen(Boolean(value.trim()));
    setActiveSuggestion(-1);
  }

  function closeSearchDialog() {
    setSearchDialogOpen(false);
    setSearchOpen(false);
    setQuery("");
    setSearchResults([]);
    setSearchError(false);
    setActiveSuggestion(-1);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closeSearchDialog();
      return;
    }
    if (!suggestions.length || !searchOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => current >= suggestions.length - 1 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => current <= 0 ? suggestions.length - 1 : current - 1);
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      void selectAsset(suggestions[activeSuggestion]);
      setSearchOpen(false);
    }
  }

  function handleFeaturedKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    featuredRail.current?.scrollBy({ left: event.key === "ArrowRight" ? 140 : -140, behavior: preferredScrollBehavior() });
  }

  useEffect(() => {
    if (!detail || !selectedVariant) return;
    const url = new URL(window.location.href);
    url.searchParams.set("asset", detail.asset.assetId);
    url.searchParams.set("mint", selectedVariant.mint);
    window.history.replaceState(null, "", url);
  }, [detail, selectedVariant]);

  async function selectAsset(asset: Asset, force = false) {
    setSearchDialogOpen(false);
    const cached = cache.current.get(asset.assetId);
    const canUseCache = !force && cached && isDetailCacheFresh(cached);
    if (detail?.asset.assetId === asset.assetId && canUseCache) {
      setQuery("");
      setSearchOpen(false);
      document.getElementById("capability-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const sequence = ++requestSequence.current;
    setLoadingId(asset.assetId);
    setError(null);
    setQuery("");
    setSearchOpen(false);
    try {
      const next: AssetDetail = canUseCache ? cached.detail : await fetch(`/api/assets/${encodeURIComponent(asset.assetId)}`).then(async (response) => {
        if (!response.ok) throw new Error("This asset could not be loaded");
        return response.json() as Promise<AssetDetail>;
      });
      if (sequence !== requestSequence.current) return;
      cache.current.set(asset.assetId, { detail: next, cachedAt: next.fetchedAt });
      setDetail(next);
      const preferredMint = preferredCapabilityMint(asset, capabilityCoverage);
      setSelectedMint(preferredMint && next.variants.some((variant) => variant.mint === preferredMint) ? preferredMint : next.variants[0]?.mint ?? "");
      setExpanded(null);
      setPreviewedCapability(null);
      requestAnimationFrame(() => {
        const behavior = preferredScrollBehavior();
        stageScroll.current?.scrollTo({ top: 0, behavior });
        document.getElementById("capability-stage")?.scrollIntoView({ behavior, block: "start" });
      });
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setError(reason instanceof Error ? reason.message : "This asset could not be loaded");
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingId(null);
    }
  }

  const baseCapabilityPresentations: CapabilityPresentation[] = [
    ...(canTrade ? [{
      id: "trade" as const,
      position: "top-left" as const,
      icon: <ArrowUpRight size={19} aria-hidden="true" />,
      title: "Trade 24/7",
      summary: tradeSummary(),
      mapSummary: "Including when US markets are closed",
      detail: <div className="capability-support"><p className="capability-explanation">Buy or sell this version through the Solana venues below.</p><VenueList markets={markets} /></div>,
    }] : []),
    ...(earnCapabilities.length ? [{
      id: "earn" as const,
      position: "top-right" as const,
      icon: <CircleDollarSign size={19} aria-hidden="true" />,
      title: "Lend it",
      summary: earnSummary(earnCapabilities[0]),
      mapSummary: `${earnCapabilities[0].provider} · variable yield`,
      detail: <div className="capability-support"><p className="capability-explanation">Deposit this version into a lending market to earn a variable yield.</p><ProtocolCapabilityList records={earnCapabilities} kind="earn" /></div>,
    }] : []),
    ...(borrowCapabilities.length ? [{
      id: "borrow" as const,
      position: "bottom-left" as const,
      icon: <LockKeyhole size={19} aria-hidden="true" />,
      title: "Borrow against it",
      summary: borrowSummary(borrowCapabilities[0]),
      mapSummary: compactBorrowSummary(borrowCapabilities[0]),
      detail: <div className="capability-support"><p className="capability-explanation">Use this version as collateral to borrow another asset.</p><ProtocolCapabilityList records={borrowCapabilities} kind="borrow" /></div>,
    }] : []),
    ...(liquidityCapabilities.length ? [{
      id: "liquidity" as const,
      position: "bottom-right" as const,
      icon: <Waves size={19} aria-hidden="true" />,
      title: "Earn trading fees",
      summary: liquiditySummary(liquidityCapabilities),
      mapSummary: compactLiquiditySummary(liquidityCapabilities),
      detail: <div className="capability-support"><p className="capability-explanation">Add this version to a trading pool and earn a share of fees when people trade.</p><LiquidityCapabilityList records={liquidityCapabilities} /></div>,
    }] : []),
  ];
  const capabilityLayout = capabilityMapLayouts[baseCapabilityPresentations.length] ?? capabilityMapLayouts[4];
  const capabilityPresentations = baseCapabilityPresentations.map((capability, index) => ({
    ...capability,
    position: capabilityLayout[index] ?? capability.position,
  }));

  const capabilityStatus = <>
    {!selectedProtocolCapabilities && !capabilityRequestFailed ? <p className="capability-checking">Checking more capabilities…</p> : null}
    {capabilityRequestFailed ? <p className="capability-source-error">Some protocol details aren’t available right now. That doesn’t mean an action has disappeared.</p> : null}
    {kaminoState?.status === "failed" ? <p className="capability-source-error">Kamino isn’t answering right now. That doesn’t mean the option is gone.</p> : null}
    {meteoraState?.status === "failed" ? <p className="capability-source-error">Meteora isn’t answering right now. That doesn’t mean the option is gone.</p> : null}
    {!canTrade && selectedProtocolCapabilities && !earnCapabilities.length && !borrowCapabilities.length && !liquidityCapabilities.length ? <div className="capability-empty"><strong>No verified actions for this version yet.</strong><p>Other stocks can do more on Solana.</p><Link href="/browse">Explore stocks with verified actions</Link></div> : null}
  </>;

  return (
    <main className="page-shell">
      <header className="topbar" id="top">
        <h1>What can your stock do on Solana?</h1>
        <div className="header-actions">
          <button
            className="search-trigger"
            type="button"
            ref={searchTrigger}
            aria-label="Search stocks and ETFs"
            aria-haspopup="dialog"
            onClick={() => setSearchDialogOpen(true)}
          >
            <Search size={19} aria-hidden="true" />
          </button>
        </div>
        <dialog
          className="search-dialog"
          ref={searchDialog}
          aria-labelledby="search-dialog-title"
          onCancel={(event) => { event.preventDefault(); closeSearchDialog(); }}
          onClose={() => { setSearchDialogOpen(false); searchTrigger.current?.focus(); }}
          onClick={(event) => { if (event.target === event.currentTarget) closeSearchDialog(); }}
        >
          <div className="search-dialog-inner">
            <h2 className="sr-only" id="search-dialog-title">Search stocks and ETFs</h2>
            <div className="search-composer">
              <div className="search-field">
                <Search size={19} aria-hidden="true" />
                <label className="sr-only" htmlFor="asset-search">Search stocks and ETFs</label>
                <input
                  id="asset-search"
                  ref={searchInput}
                  type="search"
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  onFocus={() => query.trim() && setSearchOpen(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search stocks or ETFs…"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={Boolean(query && searchOpen)}
                  aria-controls="asset-search-results"
                  aria-activedescendant={activeSuggestion >= 0 ? `asset-search-option-${activeSuggestion}` : undefined}
                />
                <button className="search-close" type="button" aria-label="Close search" onClick={closeSearchDialog}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {query && searchOpen ? (
                <div className="search-results" id="asset-search-results" role="listbox" aria-label="Search results">
                  {searchLoading ? <div className="search-empty search-loading" aria-live="polite"><strong>Searching…</strong></div> : searchError ? (
                    <div className="search-empty" role="alert"><strong>Search is temporarily unavailable</strong><span>Try again in a moment.</span></div>
                  ) : suggestions.length ? suggestions.map((asset, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeSuggestion === index}
                      id={`asset-search-option-${index}`}
                      key={asset.assetId}
                      tabIndex={-1}
                      onPointerMove={() => setActiveSuggestion(index)}
                      onClick={() => selectAsset(asset)}
                    >
                      <AssetLogo asset={asset} size={36} />
                      <span><strong>{asset.name}</strong><small>{asset.symbol} · {asset.category === "etf" ? "ETF" : "Stock"}</small></span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  )) : <div className="search-empty"><strong>No exact match</strong><span>Try a company name or ticker.</span></div>}
                </div>
              ) : null}
              <div className="search-browse"><Link href="/browse" onClick={closeSearchDialog}>Browse all stocks <ArrowRight size={15} aria-hidden="true" /></Link></div>
            </div>
          </div>
        </dialog>
      </header>

      <section className="featured" aria-label="Tokenized stocks on Solana">
        <div
          className="featured-grid"
          ref={featuredRail}
          tabIndex={0}
          aria-label="Featured tokenized stocks. Scroll horizontally for more."
          onKeyDown={handleFeaturedKeyDown}
        >
          {featured.map((asset) => (
            <button type="button" className="featured-card" data-selected={detail?.asset.assetId === asset.assetId || undefined} aria-pressed={detail?.asset.assetId === asset.assetId} key={asset.assetId} onClick={() => selectAsset(asset)}>
              <AssetLogo asset={asset} size={22} />
              <span><strong>{asset.name}</strong><small>{asset.symbol}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section className="capability-stage" id="capability-stage" ref={stageScroll} aria-label="Capability spotlight" aria-busy={Boolean(loadingId)}>
        {loadingId ? <StageSkeleton /> : detail && selectedVariant ? (
          <>
            <header className="stage-header">
              <div className="identity">
                <AssetLogo asset={detail.asset} size={50} />
                <div><p>{detail.asset.symbol}</p><h2>{detail.asset.name}</h2></div>
              </div>
              <div className="price-block">
                <span className="price">{selectedVariant.market?.price != null ? money.format(selectedVariant.market.price) : "Price unavailable"}</span>
                <span className="price-symbol">{selectedVariant.symbol}</span>
                {selectedVariant.market?.priceChange24hPercent != null ? (
                  <span className={selectedVariant.market.priceChange24hPercent >= 0 ? "change-positive" : "change-negative"}>{percentage(selectedVariant.market.priceChange24hPercent)}</span>
                ) : null}
              </div>
            </header>

            <div className={`stage-body${detail.variants.length > 1 ? " has-versions" : ""}`} aria-label="Asset capabilities and context">
              <section className="capability-column" aria-labelledby="capabilities-heading">
                <h3 className="sr-only" id="capabilities-heading">What you can do</h3>
                <p className="active-version-label">{issuerPresentation(selectedVariant).label} · {selectedVariant.symbol}</p>
                {capabilitySentence ? <p className="capability-conclusion">{capabilitySentence}</p> : null}
                <div className="capability-stack capability-stack-view">
                  {capabilityPresentations.map((capability) => <CapabilityRow
                    id={capability.id}
                    icon={capability.icon}
                    title={capability.title}
                    summary={capability.summary}
                    expanded={expanded === capability.id}
                    onToggle={() => setExpanded(expanded === capability.id ? null : capability.id)}
                    key={capability.id}
                  >{capability.detail}</CapabilityRow>)}
                  {capabilityStatus}
                </div>

                {capabilityPresentations.length ? <div
                  className="capability-map-view"
                  data-capability-count={capabilityPresentations.length}
                  aria-label="Verified capability map"
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    setPreviewedCapability(null);
                    setExpanded(null);
                  }}
                >
                  <svg className="capability-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {capabilityPresentations.map((capability) => {
                      const endpoint = capabilityMapEndpoints[capability.position];
                      return <line
                        key={capability.id}
                        x1="50"
                        y1="50"
                        x2={endpoint.x}
                        y2={endpoint.y}
                        data-active={mapActiveCapability === capability.id || undefined}
                      />;
                    })}
                  </svg>
                  <div className="capability-map-center" aria-label={`Selected version ${selectedVariant.symbol}`}>
                    <strong>{selectedVariant.symbol}</strong>
                    <span>{issuerPresentation(selectedVariant).label}</span>
                  </div>
                  {capabilityPresentations.map((capability) => <MapCapabilityNode
                    key={capability.id}
                    capability={capability}
                    active={mapActiveCapability === capability.id}
                    pinned={expanded === capability.id}
                    onPreview={setPreviewedCapability}
                    onPin={() => {
                      setPreviewedCapability(null);
                      setExpanded((current) => current === capability.id ? null : capability.id);
                    }}
                  />)}
                  <div className="capability-map-status">{capabilityStatus}</div>
                </div> : null}

              </section>

              {detail.variants.length > 1 ? <section className="version-selector version-selector-rail" aria-labelledby="versions-heading">
                <div className="version-selector-copy">
                  <p className="field-label" id="versions-heading">{detail.variants.length} versions on Solana</p>
                  <p>Each version can have different actions and redemption terms.</p>
                </div>
                <div className="variant-pills" aria-label="Tokenized versions">
                  {detail.variants.map((variant) => (
                    <button
                      type="button"
                      aria-pressed={variant.mint === selectedVariant.mint}
                      key={variant.mint}
                      onClick={() => {
                        setSelectedMint(variant.mint);
                        setPreviewedCapability(null);
                        setExpanded(null);
                        requestAnimationFrame(() => stageScroll.current?.scrollTo({ top: 0, behavior: preferredScrollBehavior() }));
                      }}
                    >
                      <VariantOptionContent variant={variant} />
                    </button>
                  ))}
                </div>
              </section> : null}

              <section className="variant-column" aria-label="Version context">
                {detail.variants.length === 1 ? <>
                  <p className="field-label">About this version</p>
                  <StructureNote variant={selectedVariant} />
                </> : null}
                <VariantDetails variant={selectedVariant} marketResult={selectedMarketResult} marketScore={selectedRisk} />
                {selectedMarketResult?.status === "stale" ? <p className="stale-note">Data may be outdated · last updated {relativeTime(selectedMarketResult.observedAt)}</p> : null}
              </section>
            </div>

          </>
        ) : <div className="empty-state"><strong>No asset selected</strong><p>Choose an asset to inspect its Solana capabilities.</p></div>}
        {error ? <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => detail ? selectAsset(detail.asset, true) : assets[0] && selectAsset(assets[0], true)}>{detail ? "Try again" : "Explore an asset"}</button></div> : null}
      </section>

      <footer className="app-footer" aria-label="Site footer">
        <Link className="footer-brand" href="/" aria-label="Solquity home">
          <span className="wordmark-mark" aria-hidden="true">SQ</span>
          <span>Solquity</span>
        </Link>
        <nav className="footer-links" aria-label="Footer navigation">
          <span className="footer-market-status footer-market-full"><MarketStatusCopy hasReferenceMarket={hasReferenceMarket} session={session} /></span>
          <span className="footer-market-status footer-market-compact"><MarketStatusCopy hasReferenceMarket={hasReferenceMarket} session={session} compact /></span>
          <span className="footer-separator" aria-hidden="true" />
          <Link href="/browse">All stocks</Link>
          <span className="footer-separator" aria-hidden="true" />
          <a href="https://x.com/its0xRay" target="_blank" rel="noreferrer" aria-label="its0xRay on X">
            <XBrandIcon />
            <span>@its0xRay</span>
          </a>
        </nav>
      </footer>

    </main>
  );
}

function AssetLogo({ asset, size }: { asset: Pick<Asset, "imageUrl" | "symbol">; size: number }) {
  return asset.imageUrl
    ? <img className="asset-logo" src={asset.imageUrl} alt="" width={size} height={size} />
    : <span className="logo-fallback" style={{ width: size, height: size }}>{(asset.symbol ?? "?").slice(0, 2)}</span>;
}

function XBrandIcon() {
  return <svg className="x-brand-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>;
}

function MarketStatusCopy({ hasReferenceMarket, session, compact = false }: { hasReferenceMarket: boolean; session: ReturnType<typeof referenceSession>; compact?: boolean }) {
  if (!(hasReferenceMarket && session.supported)) {
    return compact
      ? <>Solana <span className="status-open">24/7</span></>
      : <>Solana markets <span className="status-open">open 24/7</span></>;
  }
  return compact ? <>
    US <span className={session.isOpen ? "status-open" : "status-closed"}>{session.isOpen ? "open" : "closed"}</span>
    <span className="status-separator" aria-hidden="true">·</span>
    Solana <span className="status-open">24/7</span>
  </> : <>
    US market <span className={session.isOpen ? "status-open" : "status-closed"}>{session.isOpen ? "open" : "closed"}</span>
    <span className="status-separator" aria-hidden="true">·</span>
    Solana markets <span className="status-open">open 24/7</span>
  </>;
}

function VariantOptionContent({ variant }: { variant: Variant }) {
  const issuer = issuerPresentation(variant);
  return <>
    {issuer.logo
      ? <img className="variant-issuer-mark" data-issuer={issuer.id} src={issuer.logo} alt="" width={20} height={20} aria-hidden="true" />
      : <span className="variant-issuer-fallback" aria-hidden="true">{issuer.label.slice(0, 1)}</span>}
    <span className="variant-option-copy">
      <strong title={variant.label ?? variant.issuer ?? "Version"}>{issuer.label} <span>{variant.symbol}</span></strong>
      <small>{structureCopy(variant.stockVariantTier).label}</small>
    </span>
  </>;
}

function StructureNote({ variant }: { variant: Variant }) {
  const structure = structureCopy(variant.stockVariantTier);
  return <div className="structure-note"><span className={`structure-badge ${structure.tone}`}>{structure.label}</span><p>{structure.note}</p></div>;
}

function CapabilityRow({ id, icon, title, summary, expanded, onToggle, children }: { id: string; icon: React.ReactNode; title: string; summary: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="capability-row" data-expanded={expanded || undefined}>
      <button type="button" aria-expanded={expanded} aria-controls={`${id}-detail`} onClick={onToggle}>
        <span className="capability-icon">{icon}</span>
        <span className="capability-copy"><strong>{title}</strong><span>{summary}</span></span>
        <ChevronDown className="chevron" size={18} aria-hidden="true" />
      </button>
      <div className="capability-detail" id={`${id}-detail`} hidden={!expanded}>{children}</div>
    </div>
  );
}

function MapCapabilityNode({ capability, active, pinned, onPreview, onPin }: {
  capability: CapabilityPresentation;
  active: boolean;
  pinned: boolean;
  onPreview: (id: string | null) => void;
  onPin: () => void;
}) {
  return <article
    className="capability-map-node"
    data-position={capability.position}
    data-active={active || undefined}
    data-pinned={pinned || undefined}
    onMouseEnter={() => onPreview(capability.id)}
    onMouseLeave={() => onPreview(null)}
    onFocusCapture={() => onPreview(capability.id)}
    onBlurCapture={(event) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      onPreview(null);
    }}
  >
    <button type="button" aria-expanded={active} aria-controls={`map-${capability.id}-detail`} onClick={onPin}>
      <span className="capability-icon">{capability.icon}</span>
      <span className="capability-copy"><strong>{capability.title}</strong><span>{capability.mapSummary}</span></span>
      <ChevronDown className="chevron" size={17} aria-hidden="true" />
    </button>
    <div className="capability-map-detail" id={`map-${capability.id}-detail`} hidden={!active}>{capability.detail}</div>
  </article>;
}

function VenueList({ markets }: { markets: VenueMarket[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!markets.length) return <p className="capability-empty">No trading market was returned for this version.</p>;
  const groups = new Map<string, VenueMarket[]>();
  for (const market of markets) {
    const name = venueName(market);
    groups.set(name, [...(groups.get(name) ?? []), market]);
  }
  const venues = [...groups.entries()];
  const visible = showAll ? venues : venues.slice(0, 4);
  return (
    <div className="venue-list">
      {visible.map(([name, venueMarkets]) => <VenueGroup key={name} name={name} markets={venueMarkets} />)}
      {venues.length > 4 ? <button className="venue-reveal" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer venues" : `Show ${venues.length - 4} more ${venues.length - 4 === 1 ? "venue" : "venues"}`}</button> : null}
    </div>
  );
}

function VenueGroup({ name, markets }: { name: string; markets: VenueMarket[] }) {
  const primary = markets[0];
  const metric = displayedMarketMetric(primary);
  if (markets.length === 1) return <MarketEntry market={primary} venue={name} metric={metric} />;
  return <details className="venue-group"><summary><span><strong>{name}</strong><small>{markets.length} markets</small></span></summary><div>
    {markets.map((market) => <MarketEntry key={market.address} market={market} metric={displayedMarketMetric(market)} />)}
  </div></details>;
}

function MarketEntry({ market, venue, metric }: { market: VenueMarket; venue?: string; metric: ReturnType<typeof displayedMarketMetric> }) {
  return <div className="market-entry">
    <span><strong>{venue ?? market.name ?? "Market"}</strong><small>{market.name ?? `${market.base?.symbol ?? "Asset"}/${market.quote?.symbol ?? "quote"}`}</small></span>
    <span className="venue-metric">{metric.value}<small>{metric.label}</small></span>
  </div>;
}

function capabilityMetric(record: CapabilityRecord, key: string) {
  return record.metrics.find((metric) => metric.key === key);
}

function formatRatio(value: number | string) {
  const number = Number(value) * 100;
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(Math.abs(number) < 0.01 && number !== 0 ? 3 : 2).replace(/\.00$/, "")}%`;
}

function tradeSummary() {
  return "Trade this version on Solana any time, including when US markets are closed.";
}

function earnSummary(record: CapabilityRecord) {
  return `Lend through ${record.provider} and earn a variable yield.`;
}

function borrowSummary(record: CapabilityRecord) {
  const metric = capabilityMetric(record, "maxLtv");
  return metric
    ? `Use as collateral on ${record.provider} and borrow up to ${formatRatio(metric.value)} of its value.`
    : `Use as collateral on ${record.provider} and borrow.`;
}

function compactBorrowSummary(record: CapabilityRecord) {
  const metric = capabilityMetric(record, "maxLtv");
  return metric ? `${record.provider} · up to ${formatRatio(metric.value)}` : record.provider;
}

function liquiditySummary(records: CapabilityRecord[]) {
  const providers = [...new Set(records.map((record) => record.provider))];
  return providers.length
    ? `Add it to trading pools on ${humanList(providers)} and earn a share of the fees.`
    : "Add it to Solana trading pools and earn a share of the fees.";
}

function compactLiquiditySummary(records: CapabilityRecord[]) {
  const providers = [...new Set(records.map((record) => record.provider))];
  return providers.length ? `Through ${humanList(providers)}` : "Through Solana trading pools";
}

function formatReportedPercent(value: number | string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number.toFixed(Math.abs(number) < 0.01 && number !== 0 ? 3 : 2).replace(/\.00$/, "")}%`;
}

function freshnessCopy(record: CapabilityRecord) {
  const observed = relativeTime(record.evidence.observedAt);
  if (!observed) return "Update time unavailable";
  return record.evidence.status === "stale" ? `Data may be outdated · last updated ${observed}` : `Data updated ${observed}`;
}

function ProtocolCapabilityList({ records, kind }: { records: CapabilityRecord[]; kind: "earn" | "borrow" }) {
  return <div className="protocol-capability-list">{records.map((record) => {
    const market = capabilityMetric(record, "marketName")?.value;
    const supplyApy = capabilityMetric(record, "supplyApy");
    const maxLtv = capabilityMetric(record, "maxLtv");
    const supplied = capabilityMetric(record, "totalSupplyUsd");
    const borrowed = capabilityMetric(record, "totalBorrowUsd");
    return <article key={record.id}>
      <header><div><strong>{record.provider}</strong>{market ? <span>{String(market)}</span> : null}</div><small>{freshnessCopy(record)}</small></header>
      <dl>
        {kind === "earn" && supplyApy ? <div><dt>Lending yield</dt><dd>{formatRatio(supplyApy.value)}</dd></div> : null}
        {kind === "borrow" && maxLtv ? <div><dt>Borrow up to</dt><dd>{formatRatio(maxLtv.value)}</dd></div> : null}
        {supplied ? <div><dt>Total deposited</dt><dd>{compactMoney(Number(supplied.value))}</dd></div> : null}
        {borrowed ? <div><dt>Total borrowed</dt><dd>{compactMoney(Number(borrowed.value))}</dd></div> : null}
      </dl>
      {record.evidence.appUrl ? <a className="protocol-link" href={record.evidence.appUrl} target="_blank" rel="noreferrer">View on {record.provider} <ExternalLink size={13} aria-hidden="true" /></a> : null}
    </article>;
  })}{kind === "earn" ? <p className="capability-caveat">Lending yields vary and are not guaranteed.</p> : null}</div>;
}

function LiquidityCapabilityList({ records }: { records: CapabilityRecord[] }) {
  const groups = new Map<string, CapabilityRecord[]>();
  for (const record of records) groups.set(record.provider, [...(groups.get(record.provider) ?? []), record]);
  return <div className="liquidity-provider-list">{[...groups.entries()].map(([provider, providerRecords]) => {
    const warningCount = providerRecords.filter((record) => record.provider === "Orca" && capabilityMetric(record, "hasWarning")?.value === "true").length;
    const heading = <><strong>{provider}</strong><span>{providerRecords.length} supported {providerRecords.length === 1 ? "pool" : "pools"}{warningCount ? ` · ${warningCount} flagged` : ""}</span></>;
    return providerRecords.length > 1
      ? <details className="liquidity-provider" key={provider}><summary className="liquidity-provider-heading">{heading}</summary><LiquidityPoolCards records={providerRecords} /></details>
      : <section className="liquidity-provider" key={provider}><header className="liquidity-provider-heading">{heading}</header><LiquidityPoolCards records={providerRecords} /></section>;
  })}<p className="capability-caveat">Pool returns vary, and the value of your pooled position can change.</p></div>;
}

function humanPoolName(value: number | string) {
  return String(value).replace(/\s+(?:CLMM|DLMM|DAMM(?:\s+V2)?)\b/gi, "").trim();
}

function LiquidityPoolCards({ records }: { records: CapabilityRecord[] }) {
  return <div className="protocol-capability-list">{records.map((record) => {
    const pool = humanPoolName(capabilityMetric(record, "poolName")?.value ?? "Liquidity pool");
    const apy = capabilityMetric(record, "apy24h");
    const apr = capabilityMetric(record, "apr24h");
    const tvl = capabilityMetric(record, "tvl");
    const volume = capabilityMetric(record, "volume24h");
    const orcaWarning = record.provider === "Orca" && capabilityMetric(record, "hasWarning")?.value === "true";
    return <article key={record.id}>
      <header><div><strong>{String(pool)}</strong></div><small>{freshnessCopy(record)}</small></header>
      <dl>
        {apy ? <div><dt>Reported APY</dt><dd>{formatReportedPercent(apy.value)}</dd></div> : apr ? <div><dt>Reported APR</dt><dd>{formatReportedPercent(apr.value)}</dd></div> : null}
        {tvl ? <div><dt>Deposited in this pool</dt><dd>{compactMoney(Number(tvl.value))}</dd></div> : null}
        {volume ? <div><dt>24h volume</dt><dd>{compactMoney(Number(volume.value))}</dd></div> : null}
      </dl>
      {orcaWarning ? <p className="protocol-warning">Orca has flagged this pool. Review its details before using it.</p> : null}
      {record.evidence.appUrl ? <a className="protocol-link" href={record.evidence.appUrl} target="_blank" rel="noreferrer">View on {record.provider} <ExternalLink size={13} aria-hidden="true" /></a> : null}
    </article>;
  })}</div>;
}

function VariantDetails({ variant, marketResult, marketScore }: { variant: Variant; marketResult?: AssetDetail["marketResultsByMint"][string]; marketScore?: ReturnType<typeof riskScore> }) {
  const [copied, setCopied] = useState(false);
  async function copyMint() {
    try {
      await navigator.clipboard.writeText(variant.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return <details className="variant-details" open><summary>Technical details</summary><div>
    <p><span>Mint</span><code>{variant.mint.slice(0, 6)}…{variant.mint.slice(-6)}</code><button type="button" onClick={copyMint}>{copied ? "Copied" : "Copy"}</button></p>
    <p><span>Liquidity</span><strong>{variant.market?.liquidity != null ? compactMoney(variant.market.liquidity) : "Not reported"}</strong></p>
    <p><span>24h volume</span><strong>{variant.market?.volume24hUSD != null ? compactMoney(variant.market.volume24hUSD) : "Not reported"}</strong></p>
    <p><span>Market score</span><strong>{marketScore ? `${marketScore.grade} · ${marketScore.label}${marketScore.score != null ? ` · ${marketScore.score.toFixed(0)}/100` : ""}` : "Not available"}</strong></p>
    <p className="market-score-note"><span>Meaning</span><strong>Reported market conditions, not the overall safety of the token.</strong></p>
    <p><span>24h trades</span><strong>{variant.market?.trade24h != null ? compactValue(variant.market.trade24h) : "Not reported"}</strong></p>
    <p><span>24h wallets</span><strong>{variant.market?.uniqueWallet24h != null ? compactValue(variant.market.uniqueWallet24h) : "Not reported"}</strong></p>
    <p><span>Last trade</span><strong>{relativeTime(variant.market?.lastTradeAt) ?? "—"}</strong></p>
    <p><span>Market data</span><strong>{marketResult?.status === "stale" ? (relativeTime(marketResult.observedAt) ? `May be outdated · last updated ${relativeTime(marketResult.observedAt)}` : "May be outdated · update time unavailable") : (relativeTime(marketResult?.fetchedAt) ? `Data updated ${relativeTime(marketResult?.fetchedAt)}` : "Update time unavailable")}</strong></p>
    <p className="source-note"><span>Sources</span><strong>Solquity uses data from Tokens.xyz and integrated protocols including Kamino, Meteora, Raydium, and Orca. Values may be cached.</strong></p>
  </div></details>;
}

function StageSkeleton() {
  return <div className="stage-skeleton" aria-label="Loading asset capabilities"><span /><span /><div><span /><span /><span /></div></div>;
}
