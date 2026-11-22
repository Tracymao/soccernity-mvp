# Copy humanize: Cloudflare draft (CH-D1)

Draft: `docs/cloudflare-processor-and-cross-border-draft.md`, v0.3 to v0.4. Still a DRAFT for counsel: NOT APPROVED, NOT LEGAL ADVICE. Branch `copy/humanize-cloudflare-draft`, cut from `origin/main` `5b63cfe`. No open PR touched this file or the counsel pack.

## 1. Facts block (applied first)

The draft gives no hosting or processor location as "EU" or "Frankfurt" alone, and never says R2 location is "not set". It does mention Neon and Upstash only in a quoted Part C row title (line 370/460), which is unchanged. The edits are therefore the R2 and proxied-media statements only. Each is marked `[v0.4 CHANGED, #536 or #541]`.

| Line (before) | Before | After | Source |
|---|---|---|---|
| 100 | DNS records "DNS only" (not proxied) until the build | same, plus: the R2 media custom domain `media.soccernity.com` is proxied by Cloudflare from the start | #541 |
| 102 | R2 "Already planned (#307); separate role" | plus: R2 is in the EU jurisdiction and its public media address is proxied from the start | #536, #541 |
| 125-126 | "If the public media address is later put behind a Cloudflare custom domain ... media viewing would pass through the same Cloudflare. [OPEN]" | The public media address is a Cloudflare custom domain, proxied from the start, so media viewing passes through the same Cloudflare. [OPEN] kept | #541 |
| 446-447 | Whether the stored-media public address becomes a Cloudflare-proxied domain is a separate decision | It is a Cloudflare-proxied domain from the start, so media viewing is part of the same processing | #541 |

Plus a changelog sentence (v0.3 to v0.4) and the top line required by the brief. To keep line numbers fixed (counsel-pack-check.py reads this file by hard-coded line numbers) both were added to existing lines, not as new lines or sections: the top line sits on the Status line and the changelog sentence on the version line (line 24).

## 2. Dashes

Em dashes: 73 before, 40 after. Wording changed in headings, the Q-number list (Q1 to Q11 now "Q1: ..."), and prose. Left on purpose: dashes inside bracketed markers, quoted statute and policy text, the empty-cell "—" in tables, and one line inside an `[OPEN: counsel ...]` marker (line 359). Hyphens and numeric ranges (R17–R22, EU–US, UK–US) are untouched. "Not X but Y" contrasts and stacked hedges: none found worth changing without risk to a condition, so none were changed.

## 3. Sentences left on purpose

All sentences with shall/may, only if, unless are untouched. The statute quotation at NDPA s. 41(1) lost one dash only ("unless — (a)" now "unless (a)") and keeps its words.

## 4. Other stale statements (listed, not fixed)

- Line 51 (v0.3 changelog) says the scanning tool "would need a cache in front of `media.soccernity.com` (which would reverse #518)". #541 now says that domain is proxied from the start, so this reasoning is out of date.
- References to legal copy v0.11/v0.17 and DPIA v0.3/v0.9 (lines 9, 53, 367-388, 454): both documents are newer now.
- Line 466: quotes the DPIA §1.5 as saying hosting and data location are undecided; the hosting facts (#391, #536) are now decided.
- Neon and Upstash location (London, eu-west-2, #536) and Render Frankfurt are not stated anywhere in this draft; whether they should be is for counsel.

## 5. Freeze check

Script: `freeze.py` in the session scratchpad (counts numbers, bracketed markers, Decision Log/B-ID/Q/R/row references, statute and regulator names, and key terms before and after, then diffs the counts). Output:

```
numbers DIFF 
    '0.3' 20 -> 21
    '0.4' 0 -> 9
    '11' 30 -> 33
    '2' 28 -> 31
    '2026' 18 -> 21
    '21' 2 -> 5
    '536' 0 -> 5
    '541' 0 -> 8
markers DIFF 
    '[COPY PENDING LEGAL REVIEW]' 22 -> 23
    '[v0.4 CHANGED, #536, #541]' 0 -> 3
    '[v0.4 CHANGED, #541]' 0 -> 3
refs DIFF 
    '#536' 0 -> 5
    '#541' 0 -> 8
    'R2' 12 -> 15
statutes identical 
terms DIFF 
    'NOT APPROVED' 6 -> 7
    'draft' 44 -> 46
```

Reading it: every difference is from the added v0.4 changelog sentence, the top line, the version line and the facts-block text (new numbers 0.4, 2026, 21, 536, 541; one more [COPY PENDING LEGAL REVIEW]; more "draft" and "NOT APPROVED" words; R2 mentions). Statutes: identical. No original marker, number or reference was removed.

## 6. Other checks

- `docs/counsel-pack-check.py`: ran after the edits: checks (a) to (d) PASS, 248 items = 133 A + 115 non-A (same as before the edits). My first draft inserted new lines and broke checks (a) and (b) (246 items) because the script uses hard-coded line numbers for this file; fixed by adding the text to existing lines. Only existing "prose also mentions" notes appear. `check_version_consistency.py` does not exist in the repo, so it was not run. The pack was not edited.
- `check_version_consistency.py`: does not exist in the repo, not run.
- Nothing else run (docs only).
