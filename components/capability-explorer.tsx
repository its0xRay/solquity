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
import { useEffect, useRef, useState } from "react";
import { ScenarioExplorer } from "./scenario-explorer";
import { DetailDrawer } from "./detail-drawer";
import { ActionContext, ConceptComparison } from "./action-context";
import { VersionContext, MorePossibilities } from "./version-context";
import { contentFor, issuerId, providerName, redemptionLabel } from "@/lib/issuer-content";
import { ANALYTICS_NAVIGATION, trackEvent } from "@/lib/analytics";
import { StockStrip } from "./stock-strip";
import { assetUrl } from "@/lib/asset-url";
import { mergeAssetDetail, mergeProtocolResponse, protocolForDisplay } from "@/lib/progressive-data";
import { sourceFailure, sourceStale } from "@/lib/source-result";
import { lendingIncome, positiveAmount, type ScenarioInputs, type ScenarioMode } from "@/lib/scenario";
import { formatScenarioMoney } from "@/lib/scenario-explanation";
import { preferredCapabilityMint, type CapabilityCoverageIndex } from "@/lib/capability-coverage";
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
  const label = providerName(variant);
  const identity = `${label} ${variant.issuer ?? ""} ${variant.issuerUrl ?? ""}`.toLocaleLowerCase();

  if (issuerId(variant) === "backpack" || identity.includes("backpack")) return { label: "Backpack", logo: "/issuers/backpack.png", id: "backpack" };
  if (issuerId(variant) === "xstocks") return { label: "xStocks", logo: "/issuers/xstocks.svg", id: "xstocks" };
  if (issuerId(variant) === "ondo") return { label: "Ondo", logo: "/issuers/ondo.svg", id: "ondo" };
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

type ExplorerProps = { assets: Asset[]; capabilityCoverage: CapabilityCoverageIndex; initialDetail: AssetDetail | null; initialMint?: string; initialError?: string | null; initialScenario: ScenarioInputs; homeRoute?: boolean; loadUniverse?: boolean };
type CapabilityPresentation = {
  id: "trade" | "earn" | "borrow" | "liquidity";
  icon: React.ReactNode;
  title: string;
  summary: string;
  mapSummary: string;
  detail: React.ReactNode;
};

export function CapabilityExplorer({ assets: initialAssets, capabilityCoverage, initialDetail, initialMint, initialError = null, initialScenario, homeRoute = false, loadUniverse = false }: ExplorerProps) {
  const [assets, setAssets] = useState(initialAssets);
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
  const [drawer, setDrawer] = useState<"trade" | "checks" | null>(null);
  const [scenario, setScenario] = useState<ScenarioInputs>(initialScenario);
  const [amountEditing,setAmountEditing] = useState(false);
  const showHomeIntro = homeRoute && !initialScenario.mode;
  const AssetHeading = showHomeIntro ? "h2" : "h1";
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [clock, setClock] = useState(() => Date.now());
  const cache = useRef(new Map<string, DetailCacheEntry>(
    initialDetail ? [[initialDetail.asset.assetId, { detail: initialDetail, cachedAt: initialDetail.fetchedAt }]] : [],
  ));
  const requestSequence = useRef(0);
  const overviewRequests = useRef(new Map<string, Promise<AssetDetail>>());
  const riskRequests = useRef(new Map<string, Promise<void>>());
  const protocolCache = useRef<Record<string, ProtocolCacheEntry>>({});
  const searchDialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const stageScroll = useRef<HTMLElement>(null);
  const [protocolCapabilitiesByMint, setProtocolCapabilitiesByMint] = useState<Record<string, ProtocolCacheEntry>>({});
  const [capabilityErrorsByMint, setCapabilityErrorsByMint] = useState<Record<string, boolean>>({});

  const suggestions = searchResults;

  const selectedVariant = detail?.variants.find((variant) => variant.mint === selectedMint) ?? detail?.variants[0];
  const markets = selectedVariant ? detail?.displayMarketsByMint[selectedVariant.mint] ?? [] : [];
  const confirmedCapabilities = selectedVariant ? detail?.displayCapabilitiesByMint[selectedVariant.mint] ?? [] : [];
  const canTrade = confirmedCapabilities.some((capability) => capability.kind === "trade");
  const selectedProtocolEntry = selectedVariant ? protocolCapabilitiesByMint[selectedVariant.mint] : undefined;
  const selectedProtocolCapabilities = selectedProtocolEntry ? protocolForDisplay(selectedProtocolEntry.response, clock) : undefined;
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
  const assetId = detail?.asset.assetId;
  const activeMint = selectedVariant?.mint;

  useEffect(() => {
    if (!loadUniverse) return;
    const controller = new AbortController();
    fetch("/api/universe", {signal:controller.signal}).then(response => response.ok ? response.json() : null)
      .then(value => { if (Array.isArray(value?.assets)) setAssets(value.assets); }).catch(() => {});
    return () => controller.abort();
  }, [loadUniverse]);

  useEffect(() => {
    if (!assetId || !activeMint) return;
    const existing = cache.current.get(assetId)?.detail.marketResultsByMint[activeMint];
    if (existing && existing.status === "success" && clock - existing.fetchedAt < 120_000) return;
    const controller = new AbortController();
    fetch(`/api/assets/${encodeURIComponent(assetId)}?view=markets&mint=${encodeURIComponent(activeMint)}`, {signal:controller.signal})
      .then(async response => { if (!response.ok) throw new Error("Market source unavailable"); return response.json() as Promise<AssetDetail>; })
      .then(next => {
        const previous = cache.current.get(assetId)?.detail;
        const merged = previous ? mergeAssetDetail(previous,next) : next;
        cache.current.set(assetId,{detail:merged,cachedAt:Date.now()});
        setDetail(current => current?.asset.assetId === assetId ? mergeAssetDetail(current,next) : current);
      }).catch(reason => {
        if (controller.signal.aborted) return;
        const previous = cache.current.get(assetId)?.detail;
        if (!previous) return;
        const last = previous.marketResultsByMint[activeMint];
        const result = last && last.status !== "failed"
          ? sourceStale(last.data,last.status === "stale" ? last.observedAt : last.fetchedAt,reason)
          : sourceFailure<VenueMarket[]>(reason);
        const next = {...previous,marketResultsByMint:{...previous.marketResultsByMint,[activeMint]:result}};
        cache.current.set(assetId,{detail:next,cachedAt:Date.now()});
        setDetail(current => current?.asset.assetId === assetId ? mergeAssetDetail(current,next) : current);
      });
    return () => controller.abort();
  }, [assetId, activeMint, clock, scenario.mode]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (!assetId || !activeMint) return;
    const mint = activeMint;
    const previous = protocolCache.current[mint];
    const groups = ["kamino", "pools"].filter(group => {
      const ids = group === "kamino" ? ["kamino"] : ["meteora","raydium","orca"];
      return !isProtocolCacheFresh(previous,clock) || !ids.every(id => {
        const provider = previous?.response.providers[id];
        return provider && clock - provider.fetchedAt < (provider.status === "failed" ? 15_000 : 120_000);
      });
    });
    if (!groups.length) return;
    const controller = new AbortController();
    const requests = groups.map(async provider => {
      const response = await fetch(`/api/capabilities?asset=${encodeURIComponent(assetId)}&mint=${encodeURIComponent(mint)}&provider=${provider}`, {signal:controller.signal});
      if (!response.ok) throw new Error("Capability providers are temporarily unavailable");
      const result = await response.json() as ProtocolCapabilityResponse;
      if (!Array.isArray(result.capabilities) || !result.providers) throw new Error("Capability providers are temporarily unavailable");
      if (controller.signal.aborted) return;
      const merged = mergeProtocolResponse(protocolCache.current[mint]?.response, result);
      const entry = {response:merged,cachedAt:Date.now()};
      protocolCache.current[mint] = entry;
      setProtocolCapabilitiesByMint(current => ({...current,[mint]:entry}));
    });
    void Promise.allSettled(requests).then(results => {
      if (!controller.signal.aborted) setCapabilityErrorsByMint(current => ({...current,[mint]:results.some(result => result.status === "rejected")}));
    });
    return () => controller.abort();
  }, [clock, assetId, activeMint, scenario.mode]);

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

  useEffect(() => {
    if (!detail || !selectedVariant) return;
    const url = assetUrl({assetId:detail.asset.assetId,variant:selectedVariant,variants:detail.variants,defaultMint:preferredCapabilityMint(detail.asset,capabilityCoverage),scenario,home:homeRoute});
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(ANALYTICS_NAVIGATION));
  }, [detail, selectedVariant, scenario, capabilityCoverage, homeRoute]);

  function overview(asset: Asset, force = false) {
    const existing = cache.current.get(asset.assetId);
    if (!force && existing && isDetailCacheFresh(existing)) return Promise.resolve(existing.detail);
    const pending = overviewRequests.current.get(asset.assetId);
    if (pending) return pending;
    const request = fetch(`/api/assets/${encodeURIComponent(asset.assetId)}?view=overview`).then(async response => {
      if (!response.ok) throw new Error("This asset could not be loaded");
      const next = await response.json() as AssetDetail;
      const previous = cache.current.get(asset.assetId)?.detail;
      const merged = previous ? mergeAssetDetail(previous,next) : next;
      cache.current.set(asset.assetId,{detail:merged,cachedAt:Date.now()});
      return merged;
    }).finally(() => overviewRequests.current.delete(asset.assetId));
    overviewRequests.current.set(asset.assetId,request);
    return request;
  }

  function prefetchAsset(asset: Asset) { void overview(asset).catch(() => {}); }

  function loadTechnicalDetails() {
    if (!detail || !selectedVariant) return;
    const id = detail.asset.assetId;
    const mint = selectedVariant.mint;
    const key = `${id}:${mint}`;
    const existing = cache.current.get(id)?.detail.riskResultsByMint[mint];
    if (existing && existing.status === "success" && Date.now() - existing.fetchedAt < 120_000 || riskRequests.current.has(key)) return;
    const request = fetch(`/api/assets/${encodeURIComponent(id)}?view=risk&mint=${encodeURIComponent(mint)}`).then(async response => {
      if (!response.ok) return;
      const risk = await response.json() as AssetDetail["riskResultsByMint"][string];
      const previous = cache.current.get(id);
      if (previous) cache.current.set(id,{...previous,detail:{...previous.detail,riskResultsByMint:{...previous.detail.riskResultsByMint,[mint]:risk}}});
      setDetail(current => current?.asset.assetId === id ? {...current,riskResultsByMint:{...current.riskResultsByMint,[mint]:risk}} : current);
    }).catch(() => {}).finally(() => riskRequests.current.delete(key));
    riskRequests.current.set(key,request);
  }

  async function selectAsset(asset: Asset, force = false) {
    setExpanded(null);
    if (!force && detail?.asset.assetId !== asset.assetId) trackEvent("stock_selected", {asset: asset.assetId});
    setSearchDialogOpen(false);
    setScenario(current => ({ ...current, mode: null }));
    const cached = cache.current.get(asset.assetId);
    const canUseCache = !force && cached && isDetailCacheFresh(cached);
    if (detail?.asset.assetId === asset.assetId && canUseCache) {
      setQuery("");
      setSearchOpen(false);
      window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
      return;
    }

    const sequence = ++requestSequence.current;
    setLoadingId(cached ? null : asset.assetId);
    if (cached) {
      setDetail(cached.detail);
      const preferred = preferredCapabilityMint(asset,capabilityCoverage);
      setSelectedMint(cached.detail.variants.some(variant => variant.mint === preferred) ? preferred! : cached.detail.variants[0]?.mint ?? "");
      setExpanded(null);
    }
    setError(null);
    setQuery("");
    setSearchOpen(false);
    try {
      const next = await overview(asset,force);
      if (sequence !== requestSequence.current) return;
      cache.current.set(asset.assetId, { detail: next, cachedAt: next.fetchedAt });
      setDetail(next);
      const preferredMint = preferredCapabilityMint(asset, capabilityCoverage);
      setSelectedMint(preferredMint && next.variants.some((variant) => variant.mint === preferredMint) ? preferredMint : next.variants[0]?.mint ?? "");
      setExpanded(null);
      setScenario(current => ({ ...current, mode: null }));
      requestAnimationFrame(() => {
        const behavior = preferredScrollBehavior();
        stageScroll.current?.scrollTo({ top: 0, behavior });
        window.scrollTo({ top: 0, behavior });
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
      icon: <ArrowUpRight size={19} aria-hidden="true" />,
      title: "Trade 24/7",
      summary: tradeSummary(),
      mapSummary: "Including when US markets are closed",
      detail: <div className="capability-support"><ActionContext kind="trade" symbol={selectedVariant?.symbol} /><VenueList markets={markets} /><ConceptComparison kind="trade" /></div>,
    }] : []),
    ...(earnCapabilities.length ? [{
      id: "earn" as const,
      icon: <CircleDollarSign size={19} aria-hidden="true" />,
      title: "Lend it",
      summary: earnSummary(earnCapabilities[0]),
      mapSummary: `${earnCapabilities[0].provider} · variable yield`,
      detail: <div className="capability-support"><ActionContext kind="earn" symbol={selectedVariant?.symbol} provider={earnCapabilities[0].provider} /><ProtocolCapabilityList records={earnCapabilities} kind="earn" /><ConceptComparison kind="earn" /></div>,
    }] : []),
    ...(borrowCapabilities.length ? [{
      id: "borrow" as const,
      icon: <LockKeyhole size={19} aria-hidden="true" />,
      title: "Borrow against it",
      summary: borrowSummary(borrowCapabilities[0]),
      mapSummary: compactBorrowSummary(borrowCapabilities[0]),
      detail: <div className="capability-support"><ActionContext kind="borrow" symbol={selectedVariant?.symbol} provider={borrowCapabilities[0].provider} /><ProtocolCapabilityList records={borrowCapabilities} kind="borrow" /><ConceptComparison kind="borrow" /></div>,
    }] : []),
    ...(liquidityCapabilities.length ? [{
      id: "liquidity" as const,
      icon: <Waves size={19} aria-hidden="true" />,
      title: "Earn trading fees",
      summary: liquiditySummary(liquidityCapabilities),
      mapSummary: compactLiquiditySummary(liquidityCapabilities),
      detail: <div className="capability-support"><ActionContext kind="liquidity" symbol={selectedVariant?.symbol} provider={liquidityCapabilities[0].provider} /><LiquidityCapabilityList records={liquidityCapabilities} /><ConceptComparison kind="liquidity" /></div>,
    }] : []),
  ];
  const capabilityPresentations = baseCapabilityPresentations;
  const pendingKinds: Record<string, boolean> = {
    trade: !selectedMarketResult,
    earn: !kaminoState && !capabilityRequestFailed,
    borrow: !kaminoState && !capabilityRequestFailed,
    liquidity: !selectedProtocolCapabilities?.providers.orca && !capabilityRequestFailed,
  };

  function openScenario(mode: ScenarioMode) {
    setScenario(current => ({ ...current, mode }));
    setExpanded(mode === "lend" ? "earn" : "borrow");
  }

  const activeAction = scenario.mode === "lend" ? "earn" : scenario.mode === "borrow" ? "borrow" : expanded;
  const headlineAmount = !amountEditing && positiveAmount(scenario.amount) !== null ? Number(scenario.amount).toLocaleString("en-US",{maximumFractionDigits:2}) : scenario.amount;
  function toggleAction(kind: string) {
    if (activeAction === kind) { setExpanded(null); setScenario(current => ({...current, mode:null})); }
    else if (kind === "earn" || kind === "borrow") openScenario(kind === "earn" ? "lend" : "borrow");
    else { setScenario(current => ({...current, mode:null})); setExpanded(kind); }
  }
  function scenarioPanel(kind: "earn" | "borrow") {
    if (!detail || !selectedVariant) return null;
    return <ScenarioExplorer embedded detail={detail} selectedMint={selectedVariant.mint} inputs={{...scenario,mode:kind === "earn" ? "lend" : "borrow"}} onChange={setScenario} onSelectMint={setSelectedMint} onBack={() => toggleAction(kind)} cached={protocolCapabilitiesByMint} issuerLabel={variant => issuerPresentation(variant).label} />;
  }

  const capabilityStatus = <>
    {(!selectedProtocolCapabilities || !["kamino","meteora","raydium","orca"].every(id => selectedProtocolCapabilities.providers[id]) || !selectedMarketResult) && !capabilityRequestFailed ? <p className="capability-checking">Checking more capabilities…</p> : null}
    {capabilityRequestFailed ? <p className="capability-source-error">Some protocol details aren’t available right now. That doesn’t mean an action has disappeared.</p> : null}
    {kaminoState?.status === "failed" ? <p className="capability-source-error">Kamino isn’t answering right now. That doesn’t mean the option is gone.</p> : null}
    {meteoraState?.status === "failed" ? <p className="capability-source-error">Meteora isn’t answering right now. That doesn’t mean the option is gone.</p> : null}
    {!canTrade && selectedMarketResult && selectedProtocolCapabilities && ["kamino","meteora","raydium","orca"].every(id => selectedProtocolCapabilities.providers[id]) && !earnCapabilities.length && !borrowCapabilities.length && !liquidityCapabilities.length ? <div className="capability-empty"><strong>No verified actions for this version yet.</strong><p>Other stocks can do more on Solana.</p><Link href="/browse">Explore stocks with verified actions</Link></div> : null}
  </>;

  return (
    <main className="page-shell">
      <header className="topbar" id="top">
        <Link className="wordmark" href="/" aria-label="Solquity home"><span className="wordmark-mark" aria-hidden="true"><span /></span>Solquity</Link>
        <nav className="primary-nav" aria-label="Main navigation"><Link href="/browse">Stocks</Link><button type="button" onClick={() => setDrawer("checks")}>How we check</button></nav>
        <div className="header-actions">
          <button
            className="search-trigger"
            type="button"
            ref={searchTrigger}
            aria-label="Search stocks and ETFs"
            aria-haspopup="dialog"
            onClick={() => setSearchDialogOpen(true)}
          >
            <Search size={17} aria-hidden="true" /><span>Search a company or ETF</span>
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
                      onPointerEnter={() => prefetchAsset(asset)}
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

      <section className={showHomeIntro ? "discovery-landing" : "compact-stock-picker"} aria-label="Explore stocks on Solana">
        {showHomeIntro ? <div className="homepage-intro"><p className="eyebrow">Stocks, on Solana</p><h1>Stocks you know.<br />Now on Solana.</h1><p className="homepage-description">See what a tokenized stock can do, what each version really is, and where to do it.</p></div> : null}
        <div className="stock-picker"><StockStrip assets={assets} coverage={capabilityCoverage} selectedId={detail?.asset.assetId} onSelect={asset => { void selectAsset(asset); }} onPrefetch={prefetchAsset} /><Link className="strip-see-all" href="/browse">See all <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </section>

      <section className="capability-stage discovery-stage" id="capability-stage" ref={stageScroll} aria-label="Capability spotlight" aria-busy={Boolean(loadingId)}>
        {loadingId ? <StageSkeleton /> : detail && selectedVariant ? (
          <>
            <header className="stage-header">
              <div className="identity">
                <AssetLogo asset={detail.asset} size={64} />
                <div><AssetHeading>{detail.asset.name}</AssetHeading><p>{detail.asset.symbol} · {detail.asset.category === "etf" ? "ETF" : "Stock"} · {detail.variants.length} {detail.variants.length === 1 ? "version" : "versions"} on Solana</p></div>
              </div>
              <div className="asset-price-context">
                <small className="token-price-caption" title="Market price for the selected token, not a separate underlying-share quote.">Token price · {selectedVariant.symbol}{selectedVariant.market?.source ? ` · ${selectedVariant.market.source === "birdeye" ? "Birdeye" : selectedVariant.market.source}` : " · Tokens.xyz"} · {relativeTime(selectedVariant.market?.asOf ?? selectedVariant.market?.lastFetchedAt) ?? "Time not reported"}</small>
                <div className="price-block"><span className="price">{selectedVariant.market?.price != null ? money.format(selectedVariant.market.price) : "Price unavailable"}</span>
                {selectedVariant.market?.priceChange24hPercent != null ? <span className={selectedVariant.market.priceChange24hPercent >= 0 ? "change-positive" : "change-negative"}>{percentage(selectedVariant.market.priceChange24hPercent)}</span> : null}</div>
                <div className="asset-market-status"><MarketStatusCopy hasReferenceMarket={hasReferenceMarket} session={session} /></div>
              </div>
            </header>
            <h2 className="exploration-heading">What could <label className="headline-amount"><span className="sr-only">Amount in dollars</span><span aria-hidden="true">$</span><input aria-label="Explore amount in dollars" type="text" inputMode="decimal" autoComplete="off" value={headlineAmount} style={{width:`${Math.max(1,headlineAmount.length)}ch`}} onFocus={() => setAmountEditing(true)} onBlur={() => setAmountEditing(false)} onChange={event => {const value = event.target.value.replaceAll(",","");if (/^\d*\.?\d{0,2}$/.test(value)) setScenario(current => ({...current,amount:value}));}} aria-invalid={scenario.amount !== "" && positiveAmount(scenario.amount) === null} /></label> of {detail.asset.name} do?</h2>
            {scenario.amount !== "" && positiveAmount(scenario.amount) === null ? <p className="input-error">Enter an amount up to $1 billion.</p> : null}
            <section className="version-selector" aria-labelledby="versions-heading">
              <div className="version-section-heading"><p className="eyebrow" id="versions-heading">{detail.variants.length > 1 ? `Same stock, ${detail.variants.length} versions` : "This version"}</p>
                <VersionContext key={detail.asset.assetId} presentation="drawer" detail={detail} selectedMint={selectedVariant.mint} onSelect={mint => {setSelectedMint(mint);}} cached={protocolCapabilitiesByMint} />
              </div>
              <div className="variant-pills" aria-label="Tokenized versions">
                {detail.variants.map(variant => {
                  const entry = protocolCapabilitiesByMint[variant.mint];
                  const response = entry ? protocolForDisplay(entry.response,clock) : undefined;
                  const kinds = new Set((response?.capabilities ?? []).map(capability => capability.kind));
                  if (detail.displayCapabilitiesByMint[variant.mint]?.some(capability => capability.kind === "trade")) kinds.add("trade");
                  return <button type="button" aria-pressed={variant.mint === selectedVariant.mint} key={variant.mint} onClick={() => { setSelectedMint(variant.mint); }}>
                    <span className="version-card-top"><strong>{variant.symbol}<span className="version-provider"> · {issuerPresentation(variant).label}</span></strong></span>
                    <span className="version-card-bottom"><span className="variant-option-copy">{redemptionLabel(variant)}</span>{!response ? <small className="uses-unchecked">Uses not checked yet</small> : null}</span>
                    <span className="version-use-dots">{(["trade","earn","borrow","liquidity"] as const).map(kind => <span key={kind} data-found={kinds.has(kind) || undefined}><i aria-hidden="true" />{({trade:"Trade",earn:"Lend",borrow:"Borrow",liquidity:"Pools"})[kind]}<span className="sr-only">{kinds.has(kind) ? ": found" : ": not confirmed"}</span></span>)}</span>
                  </button>;
                })}
              </div>
            </section>
            <div className="asset-workspace" aria-label="Asset capabilities and context">
              <section className="capability-panel" aria-labelledby="capabilities-heading">
                <h2 className="sr-only" id="capabilities-heading">What you can do</h2>
                {capabilitySentence ? <p className="sr-only">{capabilitySentence}</p> : null}
                <div className="capability-tree" aria-label="Capability map">
                  <div className="capability-tree-branches">
                    {(["trade","earn","borrow","liquidity"] as const).map(kind => {
                      const capability = capabilityPresentations.find(item => item.id === kind);
                      if (!capability) {
                        const failed = capabilityRequestFailed || (kind === "earn" || kind === "borrow" ? kaminoState?.status === "failed" || kaminoState?.partial : kind === "trade" ? selectedMarketResult?.status === "failed" : ["meteora","raydium","orca"].some(id => selectedProtocolCapabilities?.providers[id]?.status === "failed" || selectedProtocolCapabilities?.providers[id]?.partial));
                        const copy = pendingKinds[kind] ? "Checking markets…" : failed ? "Couldn’t confirm this action" : "No market found where we check";
                        const title = ({trade:"Trade",earn:"Lend it",borrow:"Borrow against it",liquidity:"Earn trading fees"})[kind];
                        return <article className="tree-node" data-expanded={activeAction === kind || undefined} key={kind}>
                          {kind === "earn" || kind === "borrow" ? <button type="button" aria-expanded={activeAction === kind} aria-controls={`tree-${kind}-detail`} onClick={() => toggleAction(kind)}><span className="capability-icon">{kind === "earn" ? <CircleDollarSign size={19} /> : <LockKeyhole size={19} />}</span><span className="tree-node-copy"><strong>{title}</strong><span>{copy}</span></span><ChevronDown size={17} aria-hidden="true" /></button> : <div className="unavailable-node"><span className="tree-node-copy"><strong>{title}</strong><span>{copy}</span></span></div>}
                          {activeAction === kind && (kind === "earn" || kind === "borrow") ? <div className="tree-node-detail" id={`tree-${kind}-detail`}>{scenarioPanel(kind)}</div> : null}
                        </article>;
                      }
                      let stat = "";
                      let statContext = capability.mapSummary;
                      if (capability.id === "trade") { stat = `${markets.length} ${markets.length === 1 ? "market" : "markets"}`; statContext = "Solana markets"; }
                      if (capability.id === "earn") {
                        const value = capabilityMetric(earnCapabilities[0], "supplyApy");
                        const amount = positiveAmount(scenario.amount);
                        const estimate = amount && value && earnCapabilities[0].evidence.status === "active" ? lendingIncome(amount,Number(value.value),365) : null;
                        stat = estimate != null ? `≈ ${formatScenarioMoney(estimate)} / yr` : value ? `${formatRatio(value.value)} APY` : "Variable yield";
                        statContext = `${value ? `${formatRatio(value.value)} APY · ` : ""}${earnCapabilities[0].provider}`;
                      }
                      if (capability.id === "borrow") {
                        const value = capabilityMetric(borrowCapabilities[0], "maxLtv");
                        const amount = positiveAmount(scenario.amount);
                        stat = value && amount && borrowCapabilities[0].evidence.status === "active" ? `Up to ${money.format(amount * Number(value.value))}` : value ? `Up to ${formatRatio(value.value)}` : "";
                        statContext = "Reported limit · terms in details";
                      }
                      if (capability.id === "liquidity") stat = `${liquidityCapabilities.length} ${liquidityCapabilities.length === 1 ? "pool" : "pools"}`;
                      return <article className="tree-node" data-expanded={activeAction === capability.id || undefined} key={capability.id}>
                        <button type="button" aria-expanded={activeAction === capability.id} aria-controls={`tree-${capability.id}-detail`} onClick={() => toggleAction(capability.id)}>
                          <span className="capability-icon">{capability.icon}</span><span className="tree-node-copy"><strong>{capability.title}</strong><span>{({trade:capability.mapSummary,earn:"Lend it out for variable interest",borrow:"Access cash while keeping stock exposure",liquidity:"Add it to a trading pool"})[kind]}</span></span><span className="tree-node-stat">{stat}<small>{statContext}</small></span><ChevronDown size={17} aria-hidden="true" />
                        </button>
                        {activeAction === capability.id ? <div className="tree-node-detail" id={`tree-${capability.id}-detail`}>{capability.id === "earn" || capability.id === "borrow" ? scenarioPanel(capability.id) : capability.detail}</div> : null}
                      </article>;
                    })}
                  </div>
                </div>
                {capabilityStatus}
              </section>
            </div>
            <MorePossibilities mint={selectedVariant.mint} response={selectedProtocolCapabilities} />
            <section className="technical-disclosure" aria-label="Version context"><VariantDetails key={selectedVariant.mint} variant={selectedVariant} marketResult={selectedMarketResult} marketScore={selectedRisk} onOpen={loadTechnicalDetails} /></section>
          </>
        ) : <div className="empty-state"><strong>No asset selected</strong><p>Choose an asset to inspect its Solana capabilities.</p><button className="primary-button" type="button" onClick={() => setSearchDialogOpen(true)}>Search stocks</button></div>}
        {error ? <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => detail ? selectAsset(detail.asset, true) : assets[0] && selectAsset(assets[0], true)}>Try again</button></div> : null}
      </section>
      <DetailDrawer open={drawer === "checks"} onClose={() => setDrawer(null)} title="How we check"><p className="drawer-lead">Explore tokenized stocks on Solana. No wallet needed.</p><p>Solquity uses data from Tokens.xyz and integrated protocols including Kamino, Meteora, Raydium, and Orca. Values may be cached.</p><div className="check-explanations"><h3>Prices and markets</h3><p>Each result shows its source and update time. If a refresh fails, last-known data stays labelled.</p><h3>Ownership and redemption</h3><p>Provider documents support the ownership copy. Source checks detect text changes and link failures; changes need review before the copy is updated.</p><h3>Scenarios</h3><p>Estimates use the reported market rate. Rates can change. Transactions happen on the external platform.</p></div></DetailDrawer>

      <footer className="app-footer" aria-label="Site footer">
        <Link className="footer-brand" href="/" aria-label="Solquity home">
          <span className="wordmark-mark" aria-hidden="true"><span /></span>
          <span>Solquity</span>
        </Link>
        <nav className="footer-links" aria-label="Footer navigation">
          <span className="footer-market-status"><MarketStatusCopy hasReferenceMarket={hasReferenceMarket} session={session} /></span>
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

function MarketStatusCopy({ hasReferenceMarket, session }: { hasReferenceMarket: boolean; session: ReturnType<typeof referenceSession> }) {
  return <>
    {hasReferenceMarket && session.supported ? <><span className="market-session">US markets <span className={session.isOpen ? "status-open" : "status-closed"}>{session.isOpen ? "open" : "closed"}</span></span><span className="status-separator" aria-hidden="true">·</span></> : null}
    <span className="market-session">Solana <span className="status-open">open 24/7</span></span>
  </>;
}

function StructureNote({ variant }: { variant: Variant }) {
  const structure = structureCopy(variant.stockVariantTier);
  return <div className="structure-note"><span className={`structure-badge ${structure.tone}`}>{redemptionLabel(variant)}</span><p>{contentFor(variant)?.eligibility ?? structure.note}</p></div>;
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

function VariantDetails({ variant, marketResult, marketScore, onOpen }: { variant: Variant; marketResult?: AssetDetail["marketResultsByMint"][string]; marketScore?: ReturnType<typeof riskScore>; onOpen?: () => void }) {
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
  return <details className="variant-details" onToggle={event => { if (event.currentTarget.open) onOpen?.(); }}><summary>Technical details</summary><div>
    <p><span>Provider</span><strong>{issuerPresentation(variant).label}</strong></p>
    <p><span>Token</span><strong>{variant.symbol}</strong></p>
    <p><span>Redemption</span><strong>{redemptionLabel(variant)}</strong></p>
    <StructureNote variant={variant} />
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
