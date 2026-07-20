"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page-shell route-state-shell">
    <header className="route-state-header"><span className="wordmark-mark" aria-hidden="true">SQ</span><span>Solquity</span></header>
    <section className="route-error" role="alert">
      <p className="eyebrow">Data unavailable</p>
      <h1>Solquity could not load right now.</h1>
      <p>This is usually temporary. Try again in a moment.</p>
      <button type="button" onClick={reset}>Try again</button>
    </section>
  </main>;
}
