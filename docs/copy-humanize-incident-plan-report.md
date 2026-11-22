# CH-D4 report: humanize the incident-response and breach-notification plan

Base: origin/main 712067e15efb138d2a340a9c0fcdfc186d6450af. Branch: `copy/humanize-incident-plan`. File: `docs/incident-response-and-breach-notification-plan-draft.md`, v0.8 to v0.9. Still a DRAFT, NOT APPROVED, NOT LEGAL ADVICE.

## Counts
- Lines: 1032 before, 1032 after.
- `python -I docs/counsel-pack-check.py` (task says `python3`, which is a broken Store alias here; `python` used): exit 0 before and after, output diff empty.
- Markers (before, after): `[COPY PENDING LEGAL REVIEW` 10, 10; `[PLACEHOLDER` 42, 42; `[UNVERIFIED` 31, 31.
- Dashes (em and en) in the file: 326 before, 196 after. 170 sat inside bracketed markers (frozen), 0 in lone-cell positions, 156 in prose before; 130 prose dashes replaced (periods, commas, colons, "to" for number ranges). About 26 remain: quoted source titles, legend rows 922 to 926, and marker-adjacent text.
- `apps/web` `pendingCopyManifest.test.ts`: NOT run (no node_modules in this worktree). `npm run check:pending-copy` not run (fails by design).

## Version bump
Line 1 (title v0.9), line 10 (status adds v0.9 2026-11-21 and the marker `[v0.9 CHANGED, #536, #541]`).

## Facts block
- 391 Neon: "EU" to "London eu-west-2, not the EU" (#536, amends #391).
- 392 Upstash: same.
- 394 Sentry: "(EU region)" added.
- 395 R2: EU jurisdiction buckets; media.soccernity.com proxied by Cloudflare from the start (#541).
- 575 Q-EU2: Render Frankfurt; database and Redis London, not the EU; R2 EU jurisdiction.
- Left alone: 198 and 384 (statements about which accounts exist), 218 (conditional on the public address), 390 (Render Frankfurt, already correct).

## Unchanged by design
Legend rows 922 to 926 keep "A — open for counsel" style dashes (the check script reads them). Quoted titles in the sources list (for example line 1014) keep their dashes.

## Not done / limits
Non-dash humanizer edits (closers, triads, hedges) were not applied beyond the dash pass; only the dash and facts edits were made. Stale statements quoting other docs were not edited or listed in full.
