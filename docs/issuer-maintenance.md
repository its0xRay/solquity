# Issuer content maintenance

The compact ownership panel uses editorial snapshots in `lib/issuer-content.ts`.
It never rewrites an ownership claim from an unreviewed web response.

## Checks

- `.github/workflows/issuer-sources.yml` runs daily at 06:17 UTC after the workflow is published on the default branch and GitHub Actions is enabled. Scheduled runs can be delayed by GitHub.
- The job has read-only repository permission, requires no project API key, and saves a 30-day status artifact. It fails when a source changes, lacks a baseline, or cannot be checked.
- The ownership panel runs the same checks on demand when details or comparison are opened. Results are cached for 24 hours; unavailable sources retry after 15 minutes.
- Scheduled artifacts are maintenance records, not a live data feed to the UI. UI check times come from the application’s own requests.
- Market data continues to use its independent short-lived cache. Source checks do not establish an executable quote, account eligibility, or a successful conversion.

## Reviewing a change

1. Run `npm run check:issuer-sources` and inspect `reports/issuer-source-status.json`.
2. Read the changed official source and any linked product terms. Confirm the instrument, chain, access restrictions and route; do not infer support from a ticker.
3. Update only the affected wording/routes and their editorial review date. Review dates must reflect an actual review, not a successful fetch.
4. After that review, run `npm run check:issuer-sources -- --record-reviewed-baseline` to approve the source fingerprints. This command must never be part of the automatic workflow.
5. Run the tests, typecheck, lint and production build before publishing the reviewed update.

HTML fingerprints conservatively flag text changes, including non-substantive document edits. A failed check is not evidence that a capability was removed. Keep previous reviewed content clearly dated while investigating.

## Additional possibilities

The additional-use disclosure is hidden when there are no active, exact-mint capability records with both a source and an external destination. No example integrations or speculative placeholder products are shown. New providers need their own adapter, token identity checks and tests before being surfaced.

Do not add API credentials, private environment files or raw source documents to these reports. Only status, dates and hashes are stored by the checker.
