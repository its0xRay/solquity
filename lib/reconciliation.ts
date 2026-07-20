export type ObservedVariant = { mint: string; misses: number; lastSeenAt: number };

export function reconcileVariants(previous: ObservedVariant[], observedMints: string[], now: number, removalGraceRuns = 2) {
  const observed = new Set(observedMints);
  const retained: ObservedVariant[] = [];

  for (const mint of observed) retained.push({ mint, misses: 0, lastSeenAt: now });
  for (const item of previous) {
    if (observed.has(item.mint)) continue;
    const next = { ...item, misses: item.misses + 1 };
    if (next.misses < removalGraceRuns) retained.push(next);
  }

  return retained.sort((a, b) => a.mint.localeCompare(b.mint));
}
