"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { contentFor, identitySource, issuerId, providerName, redemptionLabel } from "@/lib/issuer-content";
import type { IssuerChecks } from "@/lib/issuer-source-check";
import type { ProtocolCacheEntry } from "@/lib/protocol-cache";
import { protocolForDisplay } from "@/lib/progressive-data";
import type { AssetDetail, ProtocolCapabilityResponse, Variant } from "@/lib/types";

const reviewDate = (date:string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
const checkTime = (time:number) => new Date(time).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"});

export function VersionContext({detail,selectedMint,onSelect,cached}: {detail:AssetDetail;selectedMint:string;onSelect:(mint:string)=>void;cached:Record<string,ProtocolCacheEntry>}) {
  const variant = detail.variants.find(item => item.mint === selectedMint) ?? detail.variants[0];
  const content = variant ? contentFor(variant) : undefined;
  const [expanded,setExpanded] = useState(false);
  const [compare,setCompare] = useState(false);
  const [checks,setChecks] = useState<Record<string,IssuerChecks>>({});
  const [checkErrors,setCheckErrors] = useState<Record<string,boolean>>({});
  const [responses,setResponses] = useState<Record<string,ProtocolCapabilityResponse>>({});
  const [marketDetails,setMarketDetails] = useState<Record<string,AssetDetail>>({});
  const [loading,setLoading] = useState(false);
  const comparisonRequest = useRef<AbortController | null>(null);
  const loaded = useRef(false);

  useEffect(() => () => comparisonRequest.current?.abort(),[]);
  useEffect(() => {
    if (!expanded && !compare) return;
    const controller = new AbortController();
    const ids = [...new Set((compare ? detail.variants : variant ? [variant] : []).flatMap(item => {const id = issuerId(item);return id ? [id] : [];}))];
    for (const id of ids) {
      fetch(`/api/issuer-sources?issuer=${id}`,{signal:controller.signal}).then(async response => {
        if (!response.ok) throw new Error("Check unavailable");
        const value = await response.json() as IssuerChecks;
        if (value.issuer !== id || !Array.isArray(value.checks)) throw new Error("Check unavailable");
        setChecks(current => ({...current,[id]:value}));
        setCheckErrors(current => ({...current,[id]:false}));
      }).catch(() => {if (!controller.signal.aborted) setCheckErrors(current => ({...current,[id]:true}));});
    }
    return () => controller.abort();
  },[expanded,compare,detail.asset.assetId,detail.variants,variant]);

  async function loadComparison() {
    if (loaded.current) return;
    comparisonRequest.current?.abort();
    const controller = new AbortController();
    comparisonRequest.current = controller;
    setLoading(true);
    await Promise.all(detail.variants.map(async item => {
      const mint = encodeURIComponent(item.mint);
      const asset = encodeURIComponent(detail.asset.assetId);
      await Promise.all([
        fetch(`/api/capabilities?asset=${asset}&mint=${mint}`,{signal:controller.signal}).then(async response => {
          if (!response.ok) return;
          const value = await response.json() as ProtocolCapabilityResponse;
          if (Array.isArray(value.capabilities)) setResponses(current => ({...current,[item.mint]:value}));
        }).catch(() => {}),
        fetch(`/api/assets/${asset}?view=markets&mint=${mint}`,{signal:controller.signal}).then(async response => {
          if (response.ok) {const value = await response.json() as AssetDetail;setMarketDetails(current => ({...current,[item.mint]:value}));}
        }).catch(() => {}),
      ]);
    }));
    if (!controller.signal.aborted) {setLoading(false);loaded.current = true;}
  }

  if (!variant) return null;
  const sourceChecks = content ? checks[content.id] : undefined;
  const reviewPending = sourceChecks?.checks.some(check => check.status === "changed" || check.status === "unreviewed");
  const providerLabel = providerName;

  function support(item:Variant) {
    const response = responses[item.mint] ?? cached[item.mint]?.response;
    const shown = response ? protocolForDisplay(response) : undefined;
    const markets = marketDetails[item.mint]?.displayMarketsByMint[item.mint] ?? detail.displayMarketsByMint[item.mint];
    return <div className="version-support">{(["trade","earn","borrow","liquidity"] as const).map(kind => {
      const records = shown?.capabilities.filter(record => record.kind === kind) ?? [];
      const names = [...new Set(kind === "trade" ? (markets ?? []).map(market => market.source ?? "Solana venue") : records.map(record => record.provider))];
      const providerIds = kind === "liquidity" ? ["meteora","raydium","orca"] : ["kamino"];
      const complete = kind === "trade" ? Boolean(marketDetails[item.mint]?.marketResultsByMint[item.mint] ?? detail.marketResultsByMint[item.mint]) : providerIds.every(id => shown?.providers[id]);
      const failed = kind === "trade" ? (marketDetails[item.mint]?.marketResultsByMint[item.mint] ?? detail.marketResultsByMint[item.mint])?.status !== "success" : providerIds.some(id => shown?.providers[id]?.status !== "success" || shown?.providers[id]?.partial);
      return <div key={kind}><span>{({trade:"Trade",earn:"Lend",borrow:"Borrow",liquidity:"Pools"})[kind]}</span><strong>{names.length ? names.join(" · ") : loading ? "Checking…" : !complete ? "Not checked yet" : failed ? "Couldn’t refresh" : "None found where we check"}</strong>{records.some(record => record.evidence.status === "stale") ? <small className="is-stale">Last known support · refresh needed</small> : null}</div>;
    })}</div>;
  }

  return <section className="ownership-panel" aria-label="This version">
    <div className="ownership-header"><p className="eyebrow">This version</p><div className="ownership-versions" aria-label="Ownership version">{detail.variants.map(item => <button type="button" key={item.mint} aria-pressed={item.mint === variant.mint} onClick={() => onSelect(item.mint)}><strong>{item.symbol ?? "Token"}</strong><span>{providerLabel(item)}</span></button>)}</div>{detail.variants.length > 1 ? <button className="text-button ownership-compare" type="button" aria-expanded={compare} onClick={() => {setCompare(value => !value);if (!compare) void loadComparison();}}>{compare ? "Close comparison" : "Compare versions"}{compare ? " ×" : " →"}</button> : null}</div>
    {compare ? <div className="ownership-comparison" aria-label="Version comparison" aria-busy={loading}>
      <p className="comparison-summary">Different providers, different exit routes. {detail.variants.map((item,index) => {const info = contentFor(item);const source = identitySource(item);return <span key={item.mint}>{index ? "; " : ""}{source ? <a href={source} target="_blank" rel="noreferrer">{item.symbol}</a> : item.symbol}: {info?.id === "xstocks" ? "shares or cash" : info?.id === "ondo" ? "cash or stablecoins" : info?.id === "backpack" ? "shares in a Backpack account" : "terms not reviewed"}</span>;})}. Access requirements and supported uses are below.</p>
      <div className="ownership-comparison-grid">{detail.variants.map(item => {const info = contentFor(item);return <article key={item.mint}><h3>{item.symbol}<small>{providerLabel(item)}</small></h3><dl>
        <div><dt>What you hold</dt><dd>{info?.holding ?? "Structure not reviewed for this version."}</dd></div>
        <div><dt>Backing</dt><dd>{info?.backing ?? "Not reviewed."}</dd></div>
        <div><dt>Dividends</dt><dd>{info?.dividends ?? "Treatment not reviewed."}</dd></div>
        <div><dt>Redemption</dt><dd>{info?.redemption ?? redemptionLabel(item)}</dd></div>
        <div><dt>Costs & access</dt><dd>{info?.costs ?? "Check the issuer’s terms."}</dd></div>
        <div><dt>Supported uses</dt><dd>{support(item)}</dd></div>
      </dl>{info ? <small className="ownership-reviewed">Copy reviewed {reviewDate(info.reviewedAt)}</small> : null}</article>;})}</div>
      <p className="ownership-footnote">Each market is separate. Rates are never blended.</p>
    </div> : <dl className="ownership-summary">
      <div><dt>What you hold</dt><dd>{content?.holding ?? "Structure not reviewed for this version."}</dd></div>
      <div><dt>Backing</dt><dd>{content?.backing ?? "Not reviewed."}</dd></div>
      <div><dt>Dividends</dt><dd>{content?.dividends ?? "Treatment not reviewed."}</dd></div>
      <div><dt>Redemption</dt><dd>{content?.redemption ?? redemptionLabel(variant)}</dd>{content?.routes.length ? <button type="button" className="inline-disclosure" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>How redemption works →</button> : null}</div>
    </dl>}
    <div className="ownership-footer"><small>{reviewPending ? <span className="is-stale">Source changed · review pending</span> : content ? `Copy reviewed ${reviewDate(content.reviewedAt)}` : "Issuer-specific details not reviewed"}</small><button type="button" className="inline-disclosure" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Hide details" : "Details & sources"}<ChevronDown size={14} aria-hidden="true" /></button></div>
    {expanded ? <div className="ownership-expanded">
      <div className="ownership-routes"><h3>Redemption routes</h3>{content ? <><p className="ownership-note">{content.ownershipNote}</p>{content.routes.map(route => <article key={route.label}><div><strong>{route.label}</strong><p className="route-steps">{route.steps.map((step,index) => <span key={step}>{index > 0 ? " → " : ""}{index === 0 ? variant.symbol ?? step : step}</span>)}</p><p>{route.note}</p></div><a className="outline-button" href={route.url} target="_blank" rel="noreferrer">Guide<ArrowUpRight size={14} aria-hidden="true" /></a></article>)}<p className="ownership-note">{content.eligibility}</p></> : <p className="ownership-note">Check this version’s issuer documentation for ownership and conversion terms.</p>}</div>
      <div className="ownership-sources"><h3>Sources</h3><div className="identity-mint"><span>Solana token</span><a href={`https://solscan.io/token/${encodeURIComponent(variant.mint)}`} target="_blank" rel="noreferrer">{variant.mint}</a>{identitySource(variant) ? <a href={identitySource(variant)} target="_blank" rel="noreferrer">Provider & token source ↗</a> : <small>Provider not verified</small>}</div>{content?.sources.map(source => {const check = sourceChecks?.checks.find(item => item.id === source.id);return <div key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight size={13} aria-hidden="true" /></a><small className={check && check.status !== "unchanged" ? "is-stale" : ""}>{!check ? checkErrors[content.id] ? "Check unavailable" : "Checking source…" : `${check.status === "unchanged" ? "No text change" : check.status === "changed" ? "Changed · review pending" : check.status === "unreviewed" ? "Baseline not reviewed" : "Couldn’t check"} · ${checkTime(check.checkedAt)}`}</small></div>;})}<p className="ownership-footnote">Source checks detect text changes and link failures. They do not test a conversion or confirm your eligibility.</p></div>
    </div> : null}
  </section>;
}

export function MorePossibilities({mint,response}: {mint:string;response?:ProtocolCapabilityResponse}) {
  const records = response?.capabilities.filter(record => record.mint === mint && ["other","perpetuals","rewards"].includes(record.kind) && record.evidence.status === "active" && record.evidence.appUrl && record.evidence.sourceUrl) ?? [];
  if (!records.length) return null;
  return <details className="more-possibilities"><summary>More possibilities <span>· {records.length}</span><ChevronDown size={15} aria-hidden="true" /></summary><div>{records.map(record => <article key={record.id}><div><strong>{record.providerCapability}</strong><small>{record.provider} · support checked {checkTime(record.evidence.observedAt < 1e12 ? record.evidence.observedAt * 1000 : record.evidence.observedAt)}</small></div><a className="outline-button" href={record.evidence.appUrl} target="_blank" rel="noreferrer">Explore<ArrowUpRight size={14} aria-hidden="true" /></a></article>)}</div></details>;
}
