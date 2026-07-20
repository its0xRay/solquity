export default function Loading() {
  return <main className="page-shell route-state-shell" aria-label="Loading Solquity">
    <header className="route-state-header"><span className="wordmark-mark" aria-hidden="true">SQ</span><span>Solquity</span></header>
    <section className="route-loading" aria-hidden="true">
      <span className="route-loading-title" />
      <span className="route-loading-rail" />
      <div className="route-loading-stage"><span /><span /><span /></div>
    </section>
    <p className="sr-only">Loading tokenized stock capabilities</p>
  </main>;
}
