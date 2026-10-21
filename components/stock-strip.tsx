"use client";

/* Logos come from third-party hosts; fixed-size native images preserve layout. */
/* eslint-disable @next/next/no-img-element */
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { featuredAssets, type CapabilityCoverageIndex } from "@/lib/capability-coverage";
import type { Asset } from "@/lib/types";

export const STRIP_START_DELAY_MS = 700;
export const STRIP_INTERACTION_PAUSE_MS = 4_000;
export const STRIP_PIXELS_PER_SECOND = 12;

export function StockStrip({ assets, coverage, selectedId, onSelect, onPrefetch }: {
  assets: Asset[]; coverage: CapabilityCoverageIndex; selectedId?: string; onSelect: (asset: Asset) => void; onPrefetch?: (asset: Asset) => void;
}) {
  const stocks = featuredAssets(assets, coverage);
  const track = useRef<HTMLDivElement>(null);
  const pauseUntil = useRef(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const element = track.current;
    if (!element || paused) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now() + STRIP_START_DELAY_MS;
    let last = performance.now();
    let position = element.scrollLeft;
    let frame = 0;
    function tick(now: number) {
      const elapsed = Math.min(now - last, 64);
      last = now;
      if (now < start || reducedMotion.matches || document.hidden || now < pauseUntil.current) {
        position = element!.scrollLeft;
      } else {
        const cycleWidth = element!.firstElementChild?.getBoundingClientRect().width ?? 0;
        if (cycleWidth > 0 && element!.scrollWidth > element!.clientWidth) {
          // Keep fractional progress: reading rounded scrollLeft every frame can stall slow motion.
          position = (position + elapsed * STRIP_PIXELS_PER_SECOND / 1000) % cycleWidth;
          element!.scrollLeft = position;
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [assets, paused]);

  function handleInteractionPause(event: { timeStamp: number }) {
    const focused = document.activeElement;
    const keyboardFocus = focused instanceof HTMLElement && track.current?.contains(focused) && focused.matches(":focus-visible");
    pauseUntil.current = keyboardFocus ? Infinity : event.timeStamp + STRIP_INTERACTION_PAUSE_MS;
  }

  if (!stocks.length) return null;
  return <nav className="stock-strip" aria-label="Featured stocks">
    <div className="stock-strip-track" ref={track} onWheel={handleInteractionPause} onPointerDown={handleInteractionPause} onPointerUp={handleInteractionPause}
      onFocusCapture={handleInteractionPause}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) handleInteractionPause(event); }}>
      {(stocks.length > 1 ? [0, 1] : [0]).map(copy => <div className="stock-strip-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
        {stocks.map(asset => <button type="button" key={asset.assetId} tabIndex={copy === 1 ? -1 : 0}
          aria-pressed={asset.assetId === selectedId} onFocus={() => onPrefetch?.(asset)} onPointerDown={() => onPrefetch?.(asset)} onClick={event => { handleInteractionPause(event); onSelect(asset); }}>
          {asset.imageUrl ? <img src={asset.imageUrl} alt="" width={24} height={24} /> : <span className="strip-logo-fallback" aria-hidden="true">{asset.symbol?.slice(0, 1) ?? "?"}</span>}
          <span className="strip-name">{asset.name}</span><span className="strip-symbol">{asset.symbol}</span>
        </button>)}
      </div>)}
    </div>
    <button className="strip-motion-toggle" type="button" aria-label={paused ? "Resume stock strip" : "Pause stock strip"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>
      {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
    </button>
  </nav>;
}
