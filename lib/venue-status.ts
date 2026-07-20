import { VenueMarket } from "./types";

export type ReviewedVenueStatus = {
  tokensVenueName: string;
  status: "excluded";
  reason: string;
  reviewedAt: string;
};

export const REVIEWED_VENUE_STATUSES: ReviewedVenueStatus[] = [
  {
    tokensVenueName: "Drift",
    status: "excluded",
    reason: "Paused following the April 2026 exploit; explicit review required before re-enabling.",
    reviewedAt: "2026-07-12",
  },
];

export function reviewedVenueStatus(market: VenueMarket): ReviewedVenueStatus | null {
  const tokensName = market.source;
  if (!tokensName) return null;
  return REVIEWED_VENUE_STATUSES.find((item) => item.tokensVenueName.toLocaleLowerCase() === tokensName.toLocaleLowerCase()) ?? null;
}

export function isVenueEligible(market: VenueMarket) {
  return reviewedVenueStatus(market) === null;
}
