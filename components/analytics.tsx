"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_NAVIGATION, GA_MEASUREMENT_ID, analyticsAllowed, analyticsPath, analyticsReferrer, protocolHost, trackEvent } from "@/lib/analytics";

type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };

export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (!analyticsAllowed(window.location.hostname, process.env.NEXT_PUBLIC_ANALYTICS_ENABLED)) return;
    const target = window as AnalyticsWindow;
    if (!target.gtag) {
      target.dataLayer = target.dataLayer ?? [];
      // Google's command queue expects an Arguments object, not an event object.
      // eslint-disable-next-line prefer-rest-params
      target.gtag = function () { target.dataLayer!.push(arguments); };
      target.gtag("js", new Date());
      target.gtag("config", GA_MEASUREMENT_ID, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: `${window.location.origin}${analyticsPath(window.location.href)}`,
        page_referrer: analyticsReferrer(document.referrer),
        page_title: "Solquity",
      });
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      script.referrerPolicy = "origin";
      document.head.appendChild(script);
    }
    // Survives StrictMode effect remounts and ignores amount/period changes.
    let lastPath = document.documentElement.dataset.analyticsPath;
    const pageView = () => {
      const path = analyticsPath(window.location.href);
      if (lastPath === path) return;
      lastPath = path;
      document.documentElement.dataset.analyticsPath = path;
      target.gtag!("event", "page_view", {page_location: `${window.location.origin}${path}`, page_referrer: analyticsReferrer(document.referrer), page_title: "Solquity"});
      const match = path.match(/^\/stocks\/([a-z0-9-]+)\/(lend|borrow)$/);
      if (match) trackEvent("scenario_opened", {asset: match[1], action: match[2] as "lend" | "borrow"});
    };
    const outbound = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;
      const provider = protocolHost(anchor.href);
      if (provider) trackEvent("protocol_opened", {provider});
    };
    pageView();
    window.addEventListener(ANALYTICS_NAVIGATION, pageView);
    window.addEventListener("popstate", pageView);
    document.addEventListener("click", outbound, true);
    return () => {
      window.removeEventListener(ANALYTICS_NAVIGATION, pageView);
      window.removeEventListener("popstate", pageView);
      document.removeEventListener("click", outbound, true);
    };
  }, [pathname]);
  return null;
}
