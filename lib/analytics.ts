export const GA_MEASUREMENT_ID = "G-8709VXPHGX";
export const ANALYTICS_NAVIGATION = "solquity:navigation";

type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };
type EventName = "stock_selected" | "scenario_opened" | "protocol_opened" | "scenario_copied";

// Never forward query strings, entered amounts, mints, link URLs or page headings.
export function analyticsPath(input: string) {
  try {
    const url = new URL(input, "https://solquity.xyz");
    if (url.pathname === "/browse") return "/browse";
    const stock = url.pathname.match(/^\/stocks\/([a-z0-9-]+)(?:\/(lend|borrow))?\/?$/i);
    if (stock) return `/stocks/${stock[1].toLowerCase()}${stock[2] ? `/${stock[2].toLowerCase()}` : ""}`;
    if (url.pathname === "/" && /^[a-z0-9-]+$/i.test(url.searchParams.get("asset") ?? "")) {
      const mode = url.searchParams.get("mode");
      return `/stocks/${url.searchParams.get("asset")!.toLowerCase()}${mode === "lend" || mode === "borrow" ? `/${mode}` : ""}`;
    }
    return "/";
  } catch { return "/"; }
}

export function analyticsAllowed(hostname: string, enabled: string | undefined) {
  return enabled === "true" && ["solquity.xyz", "www.solquity.xyz", "solquity.onrender.com"].includes(hostname);
}

export function analyticsReferrer(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch { return ""; }
}

export function trackEvent(name: EventName, labels: { asset?: string; action?: "lend" | "borrow"; provider?: string } = {}) {
  if (typeof window === "undefined" || !analyticsAllowed(window.location.hostname, process.env.NEXT_PUBLIC_ANALYTICS_ENABLED)) return;
  const safe: Record<string, string> = {};
  if (labels.asset && /^[a-z0-9-]{1,100}$/i.test(labels.asset)) safe.asset = labels.asset;
  if (labels.action === "lend" || labels.action === "borrow") safe.action = labels.action;
  if (labels.provider && /^[a-z0-9.-]{1,100}$/i.test(labels.provider)) safe.provider = labels.provider;
  (window as AnalyticsWindow).gtag?.("event", name, {
    ...safe,
    page_location: `${window.location.origin}${analyticsPath(window.location.href)}`,
    page_referrer: "",
    page_title: "Solquity",
  });
}

export function protocolHost(href: string) {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return ["kamino.com", "kamino.finance", "raydium.io", "orca.so", "meteora.ag", "byreal.io"].find(domain => host === domain || host.endsWith(`.${domain}`));
  } catch { return undefined; }
}
