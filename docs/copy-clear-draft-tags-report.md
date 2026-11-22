# CH-F1 report: clearing the pending-legal-review tag from the drafts

Branch `copy/clear-draft-tags`. Docs only. Nothing merged.

## Tag counts (the exact literal string)

| File | Before | After | Version |
|---|---|---|---|
| legal-copy-draft-tos-privacy-policy.md | 53 | 13 | v0.19 to v0.20 |
| sprint-1-dpia-outline-draft.md | 1 | 0 | v0.11 to v0.12 |
| incident-response-and-breach-notification-plan-draft.md | 10 | 0 | v0.9 to v0.10 |
| dpia-addendum-post-media-draft.md | 48 | 0 | v0.7 to v0.8 |
| dpia-addendum-contest-view-data-draft.md | 28 | 0 | v0.3 to v0.4 |
| cloudflare-processor-and-cross-border-draft.md | 22 | 0 | v0.4 to v0.5 |
| legal-copy-part-c-post-media-draft.md | 23 | 1 (variant, see below) | v0.3 to v0.4 |
| legal-copy-part-c-view-data-draft.md | 16 | 0 | v0.3 to v0.4 |

The 13 left in the legal draft are the changelog mentions (lines 52 to 85) and Part C (lines 1229 to 1308), as instructed. Each file got a version bump with one changelog sentence. Line counts and CRLF are unchanged in all eight files, and no other marker was touched.

## Stop conditions hit

1. **`npm run build:release` still fails: 13 places.** Cause known. `legalDocument.ts` imports the whole draft with `?raw`, so the entire file text, including the changelog and Part C, is embedded in the web bundle. The runtime slicing (Terms to "## PART B", Privacy to "## PART C") only decides what is displayed, not what is bundled. The checker therefore finds exactly the 13 tags that were meant to stay. None sits in the rendered Terms or Privacy text. Inside the bundle they are the changelog lines 52 to 85 plus Part C (including the Contact Us notice block). The release check cannot pass while any tag remains anywhere in this file. Options for the founder: clear the 13 as well (loses the Part C marker meaning), or change `legalDocument.ts` / the check to ignore text outside Parts A and B. I did neither (out of scope).
2. **One tag left in place.** `legal-copy-part-c-post-media-draft.md` line 211 (N-4 row) carries a variant tag: `[COPY PENDING LEGAL REVIEW; wording and the "trusted service provider" phrase are counsel's]`. Removing it would drop the statement that counsel owns that phrase, so I left it and list it here.

## Five wording fixes

Applied as specified: legal copy line 868 now reads "is left inert, so it does not auto-decline an adult into deletion." DPIA lines 572, 1083 and 1279 to 1280 and incident plan line 718 were reworded so the sentence stands without the tag (full old and new text is in the diff). Backtick-quoted mentions of the tag were reworded to "the pending-legal-review tag" to avoid empty backticks.

## Cloudflare (#541)

Line 51 now says the media address is proxied by Cloudflare from the start (#541), so the earlier reason, that it would reverse #518, no longer applies, marked `[v0.5 CHANGED, #541]`. #518 is kept. Sentences about deferring the API and static-site proxy (lines 34, 46, 48, 87, 88, 98, 335, 337, 500, 501) are unchanged because #541 concerns only the media address. No new fact was added.

## Checks

- `counsel-pack-check.py` output identical before and after (exit 0).
- Tag-only diff and number check clean apart from version, date and marker additions.
- `LegalPage` and pending-copy manifest vitest: 23 passed.
- Tests that mention the tag (PostMedia, ContactPage, messageActionRules, PushNotifications, TwoFactor*, Recovery*, pendingCopyManifest, and e2e specs 21, 25, 32, 44, 51 plus `e2e/support/helpers.ts`) concern app strings, not these drafts. I did not edit any.
- Not run: Playwright, full suites, CI.
