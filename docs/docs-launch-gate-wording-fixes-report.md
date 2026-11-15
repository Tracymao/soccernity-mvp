# Launch-gate wording fixes (docs only)

Branch `docs/launch-gate-wording-fixes`, cut from `origin/main` `4f3338d`. No open PR touched `docs/launch-gate-runbook.md` or `docs/deployment.md` at the start. Read first: `render.yaml`, `docs/backend-two-bucket-storage-report.md`, `services/api/src/storage/storage-prefixes.ts`, `services/api/src/storage/s3-storage.service.ts`. **No test, build or lint was run (docs only).** `render.yaml`, the register, the docx and all code are untouched.

## Changes (old -> new, one line each)

Runbook, `docs/launch-gate-runbook.md`:

1. Step 6.8 point 3 (the proof): "ask for an object in the private bucket through the public address; it must be REFUSED" -> three parts: (a) one object from each private prefix (`private-media/`, `private-profile/`, `quarantine/`, `data-export/`) through `media.soccernity.com` must be refused, (b) one object from each public prefix (`post-media/`, `profile-media/`, `media/`) must be served from it, (c) check in the Cloudflare dashboard that the private bucket has public access off (screen kept as UNKNOWN, no screen invented). "IF NOT: stop; do not turn uploads on." kept. The prefix lists are exactly `PUBLIC_KEY_PREFIXES` and the private prefixes named in `storage-prefixes.ts`.
2. Step 6.8 point 4: lifecycle rule "on `quarantine/`" -> "on the `quarantine/` prefix of the PRIVATE bucket (a private prefix)".
3. Step 6.8, new point 5: R2 cross-bucket copy is UNPROVEN (Cloudflare lists CopyObject, silent on cross-bucket); first real staging approval is the test; if R2 refuses the API copies through itself. Warning text quoted exactly from `s3-storage.service.ts` line 270: `[storage] cross-bucket CopyObject refused (<error name>); copying through the API instead`. YOU SHOULD SEE: an approved test photo served from `media.soccernity.com` and gone from the private bucket. Old point 5 (tighten the CSP wildcard) renumbered 6; nothing else cites it by number.
4. Part 10 line 7: "a private-prefix address is refused (step 6.8)" -> "the approved picture is served from `media.soccernity.com`, and the private bucket has no public address (step 6.8)". The checklist row (`6.8 R2 CORS + private bucket refused`) does not repeat this text, so it is unchanged.

Deployment, `docs/deployment.md`:

5. Optional item (5): "a bucket lifecycle rule that expires the `quarantine/` prefix" -> "a bucket lifecycle rule, on the private bucket, that expires the `quarantine/` prefix".
6. Step 3: "None of these three has a code default." -> "None of the three generated secrets (`JWT_SECRET`, `ADMIN_JWT_SECRET` and `DOB_ENCRYPTION_KEY`) has a code default." (the `ADMIN_2FA_ENFORCED` and `MEDIA_UPLOADS_ENABLED` bullets sit between the secrets and this line, so "these three" pointed at nothing). Rest of the bullet untouched.
7. Step 5: new item 4 for the four static sites: open each site's own `*.onrender.com` URL; expect the sign-in or sign-up page (not a Render error or blank page) and a deep link that opens the app, not a 404; the header, `/sw.js` and CSP checks are pointed to (section 4b "Manual steps that stay human" item 6, runbook Parts 6 and 10), not repeated.
8. Left alone as instructed: step 4's "Staging and the pre-deploy command" (waits on F2), dated update notes, everything else.

## Found and NOT changed

- `docs/deployment.md` section 4b "Manual steps that stay human" item 4 says to prove the private bucket is refused but does NOT carry the three-part proof (public prefixes served, dashboard check). The brief said that proof is "already in `deployment.md`"; it is the shorter form there. The runbook now has the fuller one. Not edited (out of the listed scope).
- Runbook founder question F10 and `docs/deployment.md` 4b item 3 still describe the buckets correctly; F10 does not mention the unproven cross-bucket copy (it is in step 6.8 now).
- Runbook Part 6 has no step for the static-site header, `/sw.js` or CSP checks (only `docs/deployment.md` 4b item 6 does), so the new step 5 paragraph points at Parts 6 and 10 for the staged and go-live checks in general, not for those specific commands.
- Nothing was verified against real R2, Render or Cloudflare.
