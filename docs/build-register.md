# Build register - MVP launch scope (Decision Log #378)

Source: `docs/mvp-coverage-audit.md` (PR #389, base `06dcaa0`), Decision Log #367-#380 (`docs/Soccernity_MVP_Build_Plan_v1.7.docx`, Section 9, PR #390), `docs/legal-copy-draft-tos-privacy-policy.md` v0.8 Part C, and the repo files cited per row. Written 2026-10-12 from `origin/main` `a054e71`. Updated 2026-10-14 (docs/contest-spec-decisions-2026-10-14): B-091 to B-106 added, Section 6 resolutions recorded, Section 7 extended to #392, Section 8 added; no existing row was edited.

This is a planning document only. It changes no code, schema, Figma, Decision Log or legal text. Every row traces to an audit frame number, a Decision Log number or a code path the audit (or this pass) checked. Where a fact could not be determined it is in Section 6, not guessed.

## 1. Summary

Recounted from the audit frame table (`docs/mvp-coverage-audit.md` section 2, 443 rows parsed):

| Status | Frames |
|---|---:|
| Built | 196 |
| Partial | 71 |
| Stub | 34 |
| Missing | 35 |
| NotInspected | 6 |
| **Screen frames mapped (Built + Partial + Stub + Missing + NotInspected)** | **342** |
| Reference / component / annotation (not screens) | 65 |
| Archived / hidden (not screens) | 36 |
| **All frames in the audit table** | **443** |

Per Decision Log #378, **every Missing, Stub and Partial frame is launch-blocking and in scope** (35 Missing, 34 Stub, 71 Partial). #378 does not mention the 6 NotInspected frames; this register treats them as needing verification before launch (see Section 6).

**Reconciliation.** Gap frames counted in register rows: 146 (= 71 Partial + 34 Stub + 35 Missing + 6 NotInspected). 146 gap + 196 Built = 342 screen frames, which is the audit's "342". Adding Reference (65) and Archived (36) gives 443, the audit's 443 total. Every gap frame appears in exactly one row; no frame is unaccounted for. (The brief's check "rows + Built + Reference + Archived = 342" does not hold literally because 342 already excludes Reference and Archived; see Section 6.)

Register size: **106 B-IDs** (41 carry gap frames, 65 are work items or Figma re-syncs with no gap frame of their own). B-091 to B-106 were added on 2026-10-14 (Section 8); they carry 0 gap frames, so the 146-frame reconciliation above is unchanged. Built frames that decisions #367-#380 make stale are referenced by Figma re-sync rows but stay counted in the Built bucket.

### Waves at a glance

| Wave | B-IDs | Gap frames counted |
|---|---:|---:|
| W0 Figma pass | 19 | 4 |
| W1 Backend foundations | 7 | 11 |
| W2 Country / geo | 3 | 0 |
| W3 Gates | 7 | 1 |
| W4 Username | 4 | 0 |
| W5 Profile and media | 8 | 10 |
| W6 Hold / purge + admin actions | 3 | 0 |
| W7 Contact Us | 2 | 4 |
| W8 Remaining screens by feature area | 32 | 90 |
| W9 Frontend counterparts | 14 | 22 |
| W10 Social sign-in + 2FA | 4 | 4 |
| W11 Hosting + launch gate | 3 | 0 |
| **Total** | **106** | **146** |

## 2. Register

Agent legend: DS = figma-design-system, SB = figma-screen-builder, BE = backend-api, FC = figma-to-code, QA = qa-reviewer, SG = safeguarding-drafter, FO = founder/owner input (not a subagent). "Status" is the audit status of the frames counted in the row. "Frames" is the number of gap frames counted in that row (Section 1 reconciles to 146). "Counsel-pending?" cites Part C rows of the v0.8 legal draft.

| ID | Item (Figma node ids) | Frames | Status (audit) | What is missing | Spec status | Decision Log | Depends on | Accounts / keys | Subagents (in order) | Wave | Counsel-pending? |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| B-001 | Figma re-sync: Age Gate and Below-Minimum-Age frames - refs (not counted here): 5108:6626, 5539:7264, 5464:7077, 5539:7314 | 0 | Built frames referenced (not counted as gaps) | The frames have no country field; #367/#368 make country mandatory at the Age Gate (audit Q8 confirmed none). | Figma stale or contradicts decision (Figma behind decision #367/#368); Figma done 2026-10-15, see w0-figma-pass-a-report.md | #367, #368 | - | none | DS | W0 | N |
| B-002 | Figma re-sync: restricted-pending, activation, web-consent and approved/resent frames (copy) - refs (not counted here): 5108:6630, 5531:7461, 5108:6631, 5531:7544, 5108:6629, 5531:7626, 5488:7164, 5501:8225, 5488:7248, 5501:8342 | 0 | Built frames referenced (not counted as gaps) | Remove the 'position and photo' / 'player profile' claims (#377), rewrite 'What you can still do' and change 'Go to my profile' to 'Continue registration' (#367), drop the archived 'Settings > Privacy & Safety' reference, add the request-summary panel (#372), and replace 'withdraw by contacting us' (audit s5 item 16). | Figma stale or contradicts decision; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #367, #372, #377, #379 | - | none | DS | W0 | Y (Part C rows 32, 44) |
| B-003 | Figma: archive or rewrite 'Consent Declined - Minor Notice' (5491:8241, 5501:8453) - 5491:8241, 5501:8453 | 2 | Missing x2 | The frame offers the minor 'send a new request / different guardian email' after a decline, but a decline revokes all sessions and blocks login, so no page can render; #374 says archive or rewrite (choice not made). | Figma stale or contradicts decision (#374); Figma done 2026-10-15, see w0-figma-pass-a-report.md | #374, #379 | - | none | DS | W0 | N |
| B-004 | Figma re-sync: Change Guardian Email frames (5498:7164, 5501:8536) - 5498:7164, 5501:8536 | 2 | Partial x2 | Coded page (built under #365) requires guardian name + relationship; neither frame has those fields (audit Q13). CONFIRMED 2026-10-15 (#393 (b)): frames are updated to add the guardian name and relationship fields; the code is intended. | Figma stale (update direction confirmed); Figma done 2026-10-15, see w0-figma-pass-a-report.md | #365 (existing), #60 (existing), #393 | - | none | DS | W0 | Y (Part C row 34) |
| B-005 | Figma re-sync: Register frames - DOB read-only, no date picker, Apple removed - refs (not counted here): 407:1051, 1625:2333 | 0 | Built frames referenced (not counted as gaps) | Frames show a DOB picker on Register and Apple sign-in; #367 makes DOB read-only after the Age Gate and #378 removes Apple. | Figma stale or contradicts decision; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #367, #378 | - | none | DS | W0 | N |
| B-006 | Figma re-sync: Create Profile frames (1498:2303, 1629:2449) - refs (not counted here): 1498:2303, 1629:2449 | 0 | Built frames referenced (not counted as gaps) | Frames need required username, avatar, bio, country (in place of Location), read-only auto-populated DOB, optional free-text Preferred Club; mobile frame 1629:2449 is 430px not 390 (audit Q14.14); CONFIRMED 2026-10-15 (#392 item 10 correction): 390px is canonical, so 1629:2449 must be normalised to 390 by the design agent (this row covers it; no new B-ID). | Figma stale or contradicts decision; Figma design-system leg done 2026-10-15, see w0-figma-pass-b-report.md | #367, #369, #371, #392 (item 10), #393 | - | none | DS -> SB | W0 | N |
| B-007 | Figma re-sync: other-user profile frames (6 frames) - refs (not counted here): 1455:4362, 1455:6626, 1460:8940, 5702:8250, 5778:8490, 5778:8567 | 0 | Built frames referenced (not counted as gaps) | Frames show a 'Share Profile Via' action (#371: no Share), need avatar/cover/bio/country, Block confirmation, and the owner-vs-viewer variant question is unanswered (audit Q4). | Figma stale or contradicts decision; Figma design-system leg done 2026-10-15, see w0-figma-pass-b-report.md | #371 | - | none | DS -> SB | W0 | Y (Part C row 43) |
| B-008 | Figma re-sync: Login frames - remove Apple button - refs (not counted here): 407:844, 1625:2303 | 0 | Built frames referenced (not counted as gaps) | Frames carry Google/Apple/Facebook; Apple is withdrawn by #378 (Decision Log #55's Apple half). | Figma stale or contradicts decision; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #378 | - | none | DS | W0 | N |
| B-009 | Figma re-sync: consent-email and minor-approval-email frames - refs (not counted here): 5108:6628, 5501:8584 | 0 | Built frames referenced (not counted as gaps) | 5108:6628 shows a pasted /consent/<id> link but the route is /guardian-consent/confirm?token=; 5501:8584 must carry the 'Continue registration' link (#373). | Figma stale or contradicts decision; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #373, #367 | - | none | DS | W0 | N |
| B-010 | Figma re-sync: Terms of Service / Privacy Policy frames to legal draft v0.8 - refs (not counted here): 6114:14222, 6114:14352, 6114:14471, 6114:14601, 6116:14627, 6116:14685, 6116:14734, 6116:14792 | 0 | Built frames referenced (not counted as gaps) | The 8 frames carry v0.7 text; the draft is now v0.8 and NOT APPROVED with [PROPOSAL, not yet built] markers, so a final clean sync belongs to the launch gate (B-legal gate). | Figma stale or contradicts decision | #380 (v0.8 batch) | - | none | DS | W0 | Y (Part C rows 37-44; NOT APPROVED) |
| B-011 | Figma: annotate or remove vendor-absent fields on Statistics / Standing frames - refs (not counted here): 640:3737, 667:151, 667:1511, 5822:9075, 5823:9108, 5823:9317, 756:6433, 5821:9068 | 0 | Built frames referenced (not counted as gaps) | Frames draw FORM column, xG, ratings and pressure index that #378 hides (Highlightly supplies none). | Figma stale or contradicts decision; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #378, #336 (existing) | - | none | DS | W0 | N |
| B-012 | Figma: new admin screens/actions (bad-faith, legal hold, held investigations, flagged-image queue, username revoke) - refs (not counted here): 5796:8635, 5796:8753, 5794:8635 | 0 | Built frames referenced (not counted as gaps) | No frames exist for these; Report Detail / Appeal Review (Built frames 5796:8635, 5796:8753) need the two new actions. | no Figma; Figma design-system leg done 2026-10-15, see w0-figma-pass-b-report.md | #376, #371, #369 | - | none | DS -> SB | W0 | N |
| B-013 | Figma: guardian-facing withdrawal page (new) - - | 0 | No frame counted here | POST /auth/guardian-consent/withdraw/request and /withdraw exist with no guardian-facing page and no frame (audit orphan endpoints, s5 item 16). | no Figma | #379 (item 16) | - | none | SB | W0 | Y (Part C row 44) |
| B-014 | Figma re-sync: Account Information (Confirm / Edit) frames - refs (not counted here): 2922:6396, 5695:8213, 2924:7112, 5649:8176 | 0 | Built frames referenced (not counted as gaps) | Frames carry Username and Country labelled 'no backend field yet'; country is now defined (#368) and DOB must be read-only (#367). | Figma stale or contradicts decision; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #368, #371, #367 | - | none | DS | W0 | N |
| B-015 | Figma re-sync: Two-Factor Auth frames - 'Text message' to authenticator app - refs (not counted here): 2926:8294, 5696:8213 | 0 | Built frames referenced (not counted as gaps) | Frames and disabled UI say 'Text message'; #378 decides authenticator app (QR / enter-code steps do not exist). | Figma stale or contradicts decision; Figma design-system leg done 2026-10-15, see w0-figma-pass-b-report.md | #378 | - | none | DS -> SB | W0 | Y (Part C row 44) |
| B-016 | Email links: verify-email, guardian-consent (+ withdrawal request) emails and the Verify Email screens - 5108:6628, 5439:7053, 5501:8607, 5143:6635, 5143:6648, 5143:6661, 5143:6674, 5531:7264, 5531:7284, 5531:7356, 5531:7412 | 11 | Partial x11 | Emails carry a bare code with no URL and nothing builds /verify-email?token= or /guardian-consent/confirm?token=; the 8 Verify Email screens are Partial only because no email can reach them; 5501:8607 copy differs from its frame. | Figma exists and current for Verify Email; consent-email frame needs path fix (see f_email) | #367, #379 (item 1) | B-009 | WEB_APP_BASE_URL (value); Postmark EMAIL_PROVIDER_API_KEY + POSTMARK_FROM_EMAIL to actually deliver | BE -> FC -> QA | W1 | Y (Part C row 44) |
| B-017 | Session persistence at registration, silent refresh, server-side logout (web) - - | 0 | No frame counted here | Registration keeps the token in memory only and navigates to '/'; web never calls POST /auth/refresh or /auth/logout, so the access token expires with 401s and log-out leaves the refresh token valid (audit Q9, Q14.4). | no spec | #367, #379 (item 2) | - | none | FC -> QA | W1 | N |
| B-018 | render.yaml and environment completion (22 variables read in code but absent) - - | 0 | No frame counted here | ADMIN_JWT_SECRET, STRIPE_*, S3_ENDPOINT/S3_REGION, sports TTLs etc. are missing from render.yaml; whether the API boots without ADMIN_JWT_SECRET is not known (audit Q11); HELD_INVESTIGATION_ALERT_DAYS is a constant, not an env var (s5 item 9). | no spec | #380, #379 (item 9) | - | values for every key listed in Section 4 | BE -> QA | W1 | N |
| B-019 | apps/admin .env.example - - | 0 | No frame counted here | apps/admin reads VITE_API_BASE_URL but has no .env.example (audit Q14.17). | no spec | #380 | - | none | FC | W1 | N |
| B-020 | Email-verification enforcement - - | 0 | No frame counted here | No guard reads verificationStatus (display only); #367 requires verification of every user before Create Profile but does not say which routes are blocked. | no spec for which routes (decision exists at flow level) | #367 | B-016 | none | BE -> QA | W1 | Y (Part C row 44) |
| B-021 | GET-by-consent-token request-summary endpoint - - | 0 | No frame counted here | No endpoint returns minor name, DOB, 'named as', date requested to the token holder; DOB must be decrypted server-side only for this response and the response must be identical for invalid/expired/used tokens (#372). | Decision exists; Figma panel exists (5108:6629 reference-only) | #372 | - | none | BE -> QA | W1 | Y (Part C rows 22, 44) |
| B-022 | Sports e2e key-isolation hygiene fix - - | 0 | No frame counted here | sports.e2e-spec fails locally when the root .env holds a real Highlightly key (live matches leak into assertions); source is CLAUDE.md's username bullet, not re-run here. | no spec | none (hygiene) | - | none | BE -> QA | W1 | N |
| B-023 | Country storage: declared code, derived code, method, timestamp; move off Guardian.declaredCountry - - | 0 | No frame counted here | Country exists only as Guardian.declaredCountry (self-declared, guardian-block only); no User-level declared/derived/method/timestamp. Which table holds the new fields is not stated in #368. | no spec for exact model (decision #368 lists the four values) | #368, #367 | - | none | BE -> QA | W2 | N |
| B-024 | Local GeoLite2 lookup, trust-proxy on Render, refresh process - - | 0 | No frame counted here | No lookup code or database; services/api sets no 'trust proxy' (req.ip would be Render's proxy); no owner for GeoLite2 licence terms or refresh (open in #368). IP must be read transiently and never stored. | no spec for refresh/licence | #368 | B-023 | MaxMind GeoLite2 licence/database (no env var or reference in code) | BE -> QA | W2 | Y (Part C row 38) |
| B-025 | Derived country authoritative at Register; card-verification policy re-keyed; unresolved lookup = stronger control - - | 0 | No frame counted here | Policy util keys off the self-declared guardian country (US or omitted); Age Gate country must reach RegisterDto and the derived code must decide card verification and demographic grouping. | Decision exists (#368) | #368, #367 | B-023, B-024 | none | BE -> QA | W2 | N |
| B-026 | Uniform restricted-pending write block - - | 0 | No frame counted here | follow, like, save, club join, PATCH /users/:id, PATCH represented-club and similar writes are JwtAuthGuard-only; #370 needs every such route re-checked, leaving only report/appeal, change-guardian-email, password, deactivate/delete, logout open. | Decision exists; route inventory in audit Q9 | #370, #21 (existing), #275 (existing) | - | none | BE -> QA | W3 | N |
| B-027 | Incomplete-profile gate and neutral placeholder name - - | 0 | No frame counted here | No gate: accounts without a username are shown by real display name and are not redirected to Create Profile on login. | Decision exists; placeholder name and legacy-account treatment OPEN in #369 | #369, #367 | - | none | BE -> QA | W3 | Y (Part C row 33) |
| B-028 | Email to the minor on guardian approval - 5501:8584 | 1 | Missing x1 | No template exists and confirmConsent sends nothing (audit Q12); copy not counsel-reviewed. | Figma exists and current (frame 5501:8584; link per f_email) | #373, #367 | B-016, B-009 | Postmark (EMAIL_PROVIDER_API_KEY, POSTMARK_FROM_EMAIL) to deliver | BE -> QA | W3 | Y (Part C row 44) |
| B-029 | 'Report incorrect details' flag on the guardian consent page - - | 0 | No frame counted here | No action or support flag exists; what the open flag does to the consent flow is open in #372. | Decision exists; no frame for the action | #372 | B-021 | none | BE -> QA | W3 | Y (Part C rows 22, 44) |
| B-030 | Restricted-pending routing and activation flow - - | 0 | No frame counted here | A minor lands on /community after login, never on /guardian-consent; no polling; a 'declined' row renders as pending; 'Continue registration' target (Create Profile) does not exist (audit Q1). | Decision exists (#367); frames need f_gcflow | #367, #379 | B-017, B-027, B-002 | none | BE -> FC -> QA | W3 | N |
| B-031 | Username required at Create Profile; legacy accounts - - | 0 | No frame counted here | User.username is optional and never collected at registration/Create Profile; legacy accounts have none. | Decision exists; legacy-account treatment OPEN | #369, #364 (existing) | B-027 | none | BE -> QA | W4 | Y (Part C row 33) |
| B-032 | Username moderation rules - - | 0 | No frame counted here | No reserved words, impersonation, profanity, personal-data screening, change cooldown or released-handle holding period; #369 says rules are 'specified in the build PR', not decided. | no spec (rules to be written in the build PR) | #369 | B-031 | none | BE -> QA | W4 | Y (Part C row 33) |
| B-033 | Admin revoke username (code-first, design follow-up) - - | 0 | No frame counted here | No admin action to revoke or reassign a username; no frame. | no Figma | #369 | B-032, B-012 | none | BE -> FC -> QA | W4 | N |
| B-034 | Real-name leaks: cursors and ordering - - | 0 | No frame counted here | User-search and club/group roster cursors carry raw displayName (base64) and those lists are ordered by displayName, exposing the real name of username-holders (audit Q10). | no spec | #369 (builds on #364) | - | none | BE -> QA | W4 | N |
| B-035 | User media storage: avatar/cover columns, upload endpoint, R2 public URL - - | 0 | No frame counted here | No avatar/cover columns or user upload endpoint (upload is admin-only); MediaAsset.url on R2 is the authenticated S3 endpoint, not publicly readable, and no public-base-URL variable exists. | Decision exists; no frame for upload UI beyond Create Profile / Edit Profile | #371, #307 (existing) | - | Cloudflare R2: S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT, S3_REGION (+ a public-URL variable that does not exist yet) | BE -> QA | W5 | Y (Part C rows 37, 43) |
| B-036 | Automated image check (Amazon Rekognition) and EXIF-stripping re-encode - - | 0 | No frame counted here | No Rekognition integration, no re-encode; flagged images must not go live. | Decision exists; region availability unconfirmed | #371 | B-035 | AWS account + Rekognition credentials (no env var or code reference exists) | BE -> QA | W5 | Y (Part C row 37) |
| B-037 | Flagged-image moderation queue and report/remove image - - | 0 | No frame counted here | No path routes flagged images to the admin queue or lets a user report an image; CSAM hash-matching question is open. | no Figma (see f_adminnew) | #371 | B-036, B-012 | none | BE -> FC -> QA | W5 | Y (Part C row 37) |
| B-038 | Bio and country on User; extend sensitive-content screen to Bio and Preferred Club - - | 0 | No frame counted here | No bio/country columns or write endpoint; the sensitive-content screen (#366) covers Grassroots free text only. Preferred Club is optional free text but no column holds free text (clubAffiliationId is an FK). RESOLVED 2026-10-15 (#392 item 8 correction): Preferred Club is free text stored in a NEW text field on the profile; clubAffiliationId is not used. This row covers the new column and the sensitive-content screen on it (no new B-ID). | Decision exists | #371, #367, #366 (existing), #392 (item 8) | B-023 | none | BE -> QA | W5 | Y (Part C row 43) |
| B-039 | Block user (model, endpoints, enforcement) - - | 0 | No frame counted here | No block model or endpoint although the profile menu and message actions menu show Block; effects on feed/DMs are undefined. | Figma exists; no spec for semantics | #371 | - | none | BE -> QA | W5 | N |
| B-040 | Admin media upload steps 1-2 - 916:2362, 917:24 | 2 | Partial x2 | Both steps are Partial because S3StorageService returns 503 with placeholder R2 credentials. | Figma exists and current | #380 (R2 credentials), #307 (existing) | B-035 | Cloudflare R2 keys | QA | W5 | N |
| B-041 | Post attachments and contest video upload (composer) - 2009:5168, 5818:8962, 2009:2913, 5818:8997 | 4 | Partial x4 | Composer attachment controls and contest 'Upload a video' are disabled; no media-upload endpoint for posts. | Figma exists; no decision on image checks / minors for post media | #378, #371 | B-035, B-036 | Cloudflare R2 keys; AWS Rekognition if post images are checked | BE -> FC -> QA | W5 | Y (Part C row 43) |
| B-042 | Bants create-topic frames (with / without attachment) - 2256:8925, 2355:2137, 5651:8166, 5651:8207 | 4 | Partial x4 | Attachment variant has no media upload; the audit marks the non-attachment variants Partial without giving the reason. | Figma exists; reason for Partial on non-attachment frames not stated | #378 | B-035 | Cloudflare R2 keys | BE -> FC -> QA | W5 | N |
| B-043 | Purge job: hard-delete anonymised rows 30 days after anonymisation - - | 0 | No frame counted here | No purge job (#344 'no timer' superseded); the 'no content' test must check Post/Comment/Message/Result/Report children because FKs are RESTRICT. | Decision exists; 'no content' test OPEN | #375, #344 (existing), #341 (existing) | - | none | BE -> QA | W6 | Y (Part C row 40) |
| B-044 | Hold rule extension: post-closure period, appeal window, reporter bad faith, legal hold - - | 0 | No frame counted here | Hold applies only while a report is open; no post-closure 6 months, no appeal-window logic, no bad-faith/legal-hold states; the exact field list to clear is for Temi to approve. | Decision exists; 6-month and appeal-window figures not counsel-sourced | #376, #345 (existing) | B-043 | none | BE -> QA | W6 | Y (Part C rows 23, 39, 40) |
| B-045 | Admin actions 'Reporter acted in bad faith' and 'Legal hold' + held-investigations screen - - | 0 | No frame counted here | No action buttons, no lift control; GET /admin/users/held-investigations has no apps/admin screen. | no Figma (see f_adminnew) | #376, #345 (existing) | B-044, B-012 | none | BE -> FC -> QA | W6 | Y (Part C row 39) |
| B-046 | Contact Us: page, route, endpoint, rate limit, admin inbox - 6113:14053, 6113:14199, 6115:14611, 6115:14684 | 4 | Missing x4 | No route, page or endpoint; footer 'Contact Us' is a non-link span; no admin inbox; retention period not set (never invented). | Figma exists and current for the 4 frames; endpoint/inbox/retention have no spec | #378 | - | support@soccernity.com mailbox / Postmark (EMAIL_PROVIDER_API_KEY) | BE -> FC -> QA | W7 | Y (Part C row 42) |
| B-047 | Footer legal links render as spans although /terms and /privacy exist - - | 0 | No frame counted here | Terms/Privacy/Contact are non-interactive <span>s (Footer.tsx); comment still says the routes do not exist (audit Q14.2, s5 items 6, 8). | Figma exists and current | #379 (items 6, 8) | B-046 | none | FC -> QA | W7 | N |
| B-048 | Sports Hub: vendor-absent fields hidden, not placeholders - 640:3737, 667:151, 667:1511, 5822:9075, 5823:9108, 5823:9317, 756:6433, 5821:9068 | 8 | Partial x8 | Statistics shows a disabled placeholder for vendor-absent fields and Standing has no FORM data; #378 says hide via the capability registry. | Figma stale or contradicts decision (see f_sports) | #378, #336 (existing) | B-011 | none | FC -> QA | W8 | N |
| B-049 | Contest entries/ranking, voting, already-voted (6 frames) - 2072:5584, 5802:8655, 2094:994, 5802:8726, 5802:8978, 5815:8916 | 6 | Missing x6 | No list-round-entries endpoint, no vote model or endpoint, no ranking page; 'already voted' depends on voting. | Figma exists; no spec for the voting mechanic | #378 | - | none | BE -> FC -> QA | W8 | N |
| B-050 | Contest details, between-weeks and weekly-results states - 2155:1062, 5801:8635, 5802:9183, 5815:8948, 5528:7260, 5545:7394 | 6 | NotInspected x2, Partial x4 | Details lack entries/ranking/voting subpages; between-weeks state not verified; weekly results is a leaderboard tab, not a standalone route. | Figma exists and current | #378 | B-049 | none | FC -> QA | W8 | N |
| B-051 | Contest Rules modal copy - 6241:14657, 6241:14677 | 2 | Stub x2 | Body is the visible founder-owned placeholder; no real rules copy. | Figma exists and current (placeholder by design) | #378, #227 (existing) | - | none | FO -> FC | W8 | N |
| B-052 | Competition umbrella: Leaderboard Competition tab and Admin Create Competition - 5564:7561, 5564:7832, 5565:7623, 5565:7864, 5566:8033, 5569:7813 | 6 | Stub x6 | No Competition data model or admin endpoint; the leaderboard tab prints illustrative data; Admin screens are disabled. | Figma exists; backend deferred by Build Plan 2.2 / #72-#73 vs #378 scope (see Unresolved) | #378, #72/#73 (existing) | - | none | BE -> FC -> QA | W8 | N |
| B-053 | Leaderboard overall board and empty states - 5171:6633, 5540:7264, 5542:7344, 5542:7695 | 4 | NotInspected x2, Partial x2 | All-time period disabled, club and 7-day-change columns not rendered, header comment stale; empty-state variants not verified. | Figma exists and current | #378, #379 (item 12) | - | none | BE -> FC -> QA | W8 | N |
| B-054 | Bants post page and no-results mobile - 2256:11081, 5651:8253, 5803:8917 | 3 | NotInspected x1, Partial x2 | Built page shows a room feed + composer while the frame shows a comment thread; mobile no-results variant not verified. | Figma exists; the intended difference is unclear | #378 | - | none | FC -> QA | W8 | N |
| B-055 | Search page 'Trending topics only' variant - 2896:4837 | 1 | NotInspected x1 | Variant not individually diffed against /search. | Figma exists and current | #378 | - | none | QA | W8 | N |
| B-056 | Admin Dashboard remaining sample data - 110:5 | 1 | Partial x1 | 'New users by league' and 'Latest posts' still render sample data; User has no league attribute. | Figma exists; no spec for 'by league' | #378 | - | none | BE -> FC -> QA | W8 | N |
| B-057 | Admin Add Role page - 1658:2456 | 1 | Stub x1 | Page is a stub although POST /admin/staff exists (PR #340); header comment cites a resolved decision. | Figma exists and current | #378, #379 (item 10) | - | none | FC -> QA | W8 | N |
| B-058 | Admin Delete Role - 5403:7205 | 1 | Stub x1 | No delete endpoint exists; only PATCH /admin/staff/:id/status deactivates. What 'delete' means for a staff account is undecided. | Figma exists; no spec for semantics | #378 | - | none | FO -> BE -> FC -> QA | W8 | N |
| B-059 | Settings: Account section (Account, Account Info confirm/edit, Change Password) - 2905:4798, 5607:7813, 2922:6396, 5695:8213, 2924:7112, 5649:8176, 2924:6870, 5695:8234 | 8 | Missing x4, Partial x2, Stub x2 | Account Information and Change Password rows are disabled; Confirm-Password and Edit screens have no route; Username/Country fields have no write path; Change Password works only inside EditProfileModal. | Figma stale or contradicts decision for Account Info (see f_acct); others current | #378, #368, #371 | B-014, B-023, B-038 | none | BE -> FC -> QA | W8 | N |
| B-060 | Settings: Privacy page - 6178:14437, 6185:14547 | 2 | Partial x2 | Public-profile toggle, Download my data and marketing rows are disabled; no isProfilePublic column, no data-export endpoint. | Figma exists and current | #378, #223 (existing) | - | none | BE -> FC -> QA | W8 | Y (Part C row 12) |
| B-061 | Settings: Direct Messages & Read Receipts, Your Posts (Sensitive Media) - 2926:8764, 5696:8241, 2926:8996, 5696:8261 | 4 | Missing x4 | No route; no post-visibility or DM-permission model; DM rules are already fixed by under-16 / adult-to-minor rules. | Figma exists; no spec for the models | #378, #222/#223 (existing) | - | none | BE -> FC -> QA | W8 | N |
| B-062 | Settings: Notification Preferences hub and four leaves - 2926:9721, 5696:8340, 2926:9230, 5696:8281, 2927:9954, 5696:8364, 2927:10205, 5696:8384, 2926:9482, 5696:8307 | 10 | Stub x10 | Hub only; Filters, Push, Email, Muted accounts leaves are disabled; no preference model or mute model. | Figma exists; no data-model spec | #378 | - | none | BE -> FC -> QA | W8 | N |
| B-063 | Settings: Display, Language & Region hub and four leaves - 2922:5832, 5649:8140, 6304:15181, 6303:15173, 6304:15329, 6303:15221, 6304:15471, 6303:15262, 6304:15615, 6303:15307 | 10 | Stub x10 | No stored accessibility/display/language/data-usage preferences; Language list illustrative; whether Display merges into Accessibility is open (#246, existing). | Figma exists; no spec | #378 | - | none | BE -> FC -> QA | W8 | N |
| B-064 | Saved posts tab (own profile) - 1460:8940, 5778:8567 | 2 | Missing x2 | GET /users/:id/saved-posts exists with no web consumer and ProfilePage has no Saved tab. | Figma exists and current | #378, #22 (existing) | - | none | FC -> QA | W8 | N |
| B-065 | Standalone post page and comment-expanded view - 949:73, 1620:20139, 5779:8490 | 3 | Missing x2, Partial x1 | No /posts/:id route although GET /posts/:id exists. | Figma exists and current | #378 | - | none | FC -> QA | W8 | N |
| B-066 | Community page message sidebar and chat pop-up - 1306:354 | 1 | Missing x1 | CommunityPage has neither the message sidebar nor the pop-up. | Figma exists and current | #378 | - | none | FC -> QA | W8 | N |
| B-067 | Conversation actions menu (mark read, view profile, block, delete chat) - 5709:8461 | 1 | Missing x1 | No menu; Block needs the block feature and no delete-conversation endpoint exists. | Figma exists; no spec for delete-chat | #378 | B-039 | none | BE -> FC -> QA | W8 | N |
| B-068 | Community Group page - group feed - 6453:18580, 6454:18580, 6457:18580, 6458:18580 | 4 | Partial x4 | Frames show a group feed with sample posts; no group-post model or endpoint, and the backend/design notes say none is intended. | Figma exists; contradicts Decision Log #281/#294 (existing) | #378 | - | none | FO -> BE -> FC -> QA | W8 | N |
| B-069 | Unwired transactional email templates (welcome x2, admin created, password changed/requested, deletion requested) - 1380:2274, 1661:2741, 1661:2724, 1380:2318, 1380:2297, 5439:7074 | 6 | Missing x6 | No templates or sends; 1380:2297 describes an email-link password change that does not exist and overlaps 1380:2318. | Figma exists; 1380:2297 contradicts shipped behaviour | #378 | - | Postmark (EMAIL_PROVIDER_API_KEY) to deliver | BE -> QA | W8 | N |
| B-070 | Match kickoff-alert subscription control (orphan endpoints) - - | 0 | No frame counted here | PUT/DELETE /sports/matches/:id/subscription have no UI and no frame. | no Figma | #336 (existing) | - | none | SB -> FC -> QA | W8 | N |
| B-071 | Banter room status and topics controls (orphan endpoints) - - | 0 | No frame counted here | PATCH /banter-rooms/:id/status, GET /banter-rooms/topics and POST .../topics have no UI and no frame. | no Figma | #357 (existing), #355/#356 (existing) | - | none | SB -> FC -> QA | W8 | N |
| B-072 | Stale comments and prior-claim corrections that need their own fix PRs - - | 0 | No frame counted here | LeaderboardPage header comment (s5 item 12), Add Role comment (10), Footer comment (6), legal draft ToS 3.1 vs 3.2 and Part C row 32/22 staleness (13, 14), CLAUDE.md's HELD_INVESTIGATION claim (9). | no spec | #379 | - | none | FC / BE (comments) -> SG (legal draft) -> QA | W8 | Y (ToS 3.1/3.2 wording) |
| B-073 | Age Gate: country field in the web step - - | 0 | No frame counted here | AgeGateStep has no country select and Register does not receive one. | Figma stale or contradicts decision (see f_agegate) | #367, #368 | B-001, B-025 | none | FC -> QA | W9 | N |
| B-074 | Register screen: read-only DOB, persisted session, no date picker - 407:1051, 1625:2333 | 2 | Partial x2 | Code collects first/last name and has no Username row; frames show a DOB picker and differ by breakpoint; session not persisted; social buttons arrive with oauth_login (W10). | Figma stale or contradicts decision (see f_register) | #367 | B-005, B-017, B-025, B-073 | none | FC -> QA | W9 | N |
| B-075 | Guardian Details: single full-name input, no country select - 5108:6627, 5539:7354 | 2 | Partial x2 | Code splits first/last and adds a required country select; the frame (and #368, #63) want a single name and country at the Age Gate. CONFIRMED 2026-10-15 (#393 (a)): Option A - single 'Guardian's full name' field, no country select on this step, country collected once at the Age Gate; the user fills this form, not the guardian. The DTO already takes a single name, so no backend change. SEQUENCING: must NOT ship before B-023/B-025 and B-073 (country at the Age Gate and derived country), because card verification currently reads Guardian.declaredCountry. Kept in W9. | Figma exists and current; decision confirmed | #368, #379 (item 3), #393 | B-025, B-023, B-073 | none | FC -> QA | W9 | N |
| B-076 | Restricted-pending page - 5108:6630, 5531:7461 | 2 | Partial x2 | 'Add your position and photo' row still present; 'declined' renders as pending; 'What you can still do' unchanged; no 'send again' note. | Figma stale or contradicts decision (see f_gcflow) | #367, #377, #379 (item 11) | B-002, B-030 | none | FC -> QA | W9 | N |
| B-077 | Activation confirmation page - 5108:6631, 5531:7544 | 2 | Partial x2 | 'Go to my profile' must become 'Continue registration' (Create Profile); 'Review privacy settings' is a disabled Coming-soon button although /settings/privacy exists. | Figma stale or contradicts decision (see f_gcflow) | #367 | B-002, B-030, B-081 | none | FC -> QA | W9 | N |
| B-078 | Guardian web consent page - 5108:6629, 5531:7626 | 2 | Partial x2 | Request Summary panel omitted, 'Build a player profile' claim still in code, no 'What we collect' list or withdrawal footnote. | Figma stale or contradicts decision (see f_gcflow) | #372, #377 | B-002, B-021, B-029 | none | FC -> QA | W9 | Y (Part C rows 32, 44) |
| B-079 | Guardian 'Consent approved' and 'approval resent' screens - 5488:7164, 5501:8225, 5488:7248, 5501:8342 | 4 | Partial x4 | Copy differs from frames; the resent confirmation is an inline footnote, not a screen. | Figma stale or contradicts decision (see f_gcflow) | #367 | B-002 | none | FC -> QA | W9 | N |
| B-080 | Guardian withdrawal page (web) - - | 0 | No frame counted here | No page consumes the withdraw endpoints. | no Figma (see f_withdraw) | #379 (item 16) | B-013 | none | FC -> QA | W9 | Y (Part C row 44) |
| B-081 | Create Profile screen and route - 1498:2303, 1629:2449 | 2 | Missing x2 | No route, page or endpoint; needs username, avatar, bio, country, read-only DOB, optional Preferred Club, gate for restricted-pending. | Figma stale or contradicts decision (see f_createprofile) | #367, #369, #371 | B-006, B-031, B-035, B-036, B-038, B-027, B-020 | none | FC -> QA | W9 | Y (Part C rows 33, 43) |
| B-082 | Other-user profile page (and own profile viewer parity) - 1455:4362, 1455:6626, 5702:8250, 5778:8490 | 4 | Partial x4 | No route/page for another user; GET /users/:id/public-profile has no consumer; needs cover, avatar, bio, country, Follow, message, Copy link, Block; own profile shows email, not a handle. | Figma stale or contradicts decision (see f_profile) | #371, #379 (item 5) | B-007, B-035, B-038, B-039 | none | FC -> QA | W9 | Y (Part C rows 32, 43) |
| B-083 | Edit Profile (desktop + mobile) - 1466:15934, 5702:8317 | 2 | Partial x2 | Only displayName, phone, username are editable; Bio, Location, Preferred Club and DOB are disabled. | Figma stale or contradicts decision (follows f_createprofile) | #369, #371 | B-038, B-031, B-035 | none | FC -> QA | W9 | N |
| B-084 | Google and Facebook sign-in (backend + Age Gate/guardian integration) - - | 0 | No frame counted here | No OAuth endpoint or accounts; provider DOB must never be trusted; Age Gate and guardian flow must still apply; Facebook accounts without an email need a fallback. Apple is out of scope. | Decision exists (#378); Figma buttons exist (Apple to be removed, f_login) | #378, #55 (existing) | B-025, B-026, B-030, B-008, B-017 | Google OAuth client; Meta developer app (no env vars or code references exist) | BE -> QA | W10 | Y (Part C row 41) |
| B-085 | Login screens: social buttons wired - 407:844, 1625:2303 | 2 | Partial x2 | Frames carry Google/Apple/Facebook buttons; LoginPage has none and no OAuth endpoint exists. | Figma stale or contradicts decision (see f_login) | #378 | B-084, B-008 | none | FC -> QA | W10 | Y (Part C row 41) |
| B-086 | Authenticator-app two-factor (TOTP) backend - - | 0 | No frame counted here | No TOTP backend; what is stored (secret encryption) not specified. | Decision exists (#378); storage unspecified | #378 | - | none | BE -> QA | W10 | Y (Part C row 44) |
| B-087 | Two-Factor Auth screens - 2926:8294, 5696:8213 | 2 | Stub x2 | Page shows disabled 'Text message' / 'Authentication app' toggles; no enrol, QR or code-entry steps. | Figma stale or contradicts decision (see f_2fa) | #378 | B-086, B-015 | none | FC -> QA | W10 | Y (Part C row 44) |
| B-088 | Hosting for apps/web and apps/admin (static sites, SPA rewrite, domains, CORS) - - | 0 | No frame counted here | render.yaml defines only the two API services; no host definition for either frontend exists in the repo, docs or workflows. | no spec | #380 | - | Static-site host + domain (nothing in the repo) | BE -> QA | W11 | N |
| B-089 | Launch gate: legal copy - - | 0 | No frame counted here | Remove NOT APPROVED banner and [PROPOSAL]/[OPEN] markers, fill legal entity name/registration and Effective Date, counsel re-read of v0.8+, final Figma sync (f_legal). | Decision exists (#380 lists prerequisites) | #380 | B-010, B-046 | none | FO -> SG -> FC -> QA | W11 | Y (Part C rows 2, 37-44) |
| B-090 | Launch gate: live services - - | 0 | No frame counted here | Postmark sending domain verified, support@soccernity.com working, Stripe keys (+ PCI SAQ A step), R2 credentials, Sentry region/plan, Highlightly plan (#323), real values in Render for the Section 4 keys. | Decision exists (#380 lists prerequisites) | #380 | B-018, B-088 | see Section 4 | FO -> BE -> QA | W11 | N |
| B-091 | Contest backend rebuild: community votes (one per user per round, retractable, event log), engagement counters under the platform rule, final-entry flag, hidden-until-reveal visibility and reveal scheduler (Europe/London), minimum tally, forfeit and no-winner states, follow-status snapshot, phase scheduler, replace the admin judging endpoints - refs (not counted here): none | 0 | No frame counted here | Today contests are admin-judged (POST /admin/contest/cycles/:id/rounds/:week/results, sequential judging, crown/open-final); none of the votes, final-entry flag, reveal or minimum tally exists. Existing ContestRoundWinner/ContestStanding/PointsLedgerEntry models need review. | Spec: docs/contest-spec.md (sections 3-8, 10, 13) | #381, #382, #385, #386, #387, #218 (superseded), #241 (superseded) | B-020, B-026 | none | BE -> QA | W8 | N (see Section 8) |
| B-092 | Final-week exposure engine: impression tracking, balanced-impression rotation, per-viewer shuffle, frequency cap, admin impression-distribution view (backend) - refs (not counted here): none | 0 | No frame counted here | Nothing exists: no impression model, no showcase-module endpoint, no tolerance/frequency settings, no admin distribution endpoint. | Spec: docs/contest-spec.md section 10b (founder-delegated design, approved 2026-10-14) | #388 | B-091 | none | BE -> FC -> QA | W8 | N |
| B-093 | Leaderboard points engine: quarter-point ledger, giver/receiver rule, daily caps (40/20, configurable), revocation, self-engagement exemption, content-screening condition, verified-email condition, server-validated view-qualification heartbeats, placement-points awards, rounded display - refs (not counted here): none | 0 | No frame counted here | Current ledger is integer points, one award per target, never revoked, no caps, no heartbeats; LeaderboardEntry.points is Int. | Spec: docs/contest-spec.md (sections 9a-9e, 13) | #382, #383, #384, #385, #130 (amended), #219 (superseded) | B-020, B-026, B-091 | none | BE -> QA | W8 | Y (new processing of minors' view/dwell data; no Part C row yet - see Section 8) |
| B-094 | Remove follow and post leaderboard point awards (the 2026-10-14 grep found them): ENGAGEMENT_POINTS.POST_CREATED/FOLLOW_MADE and the awardPoints calls in feed.service.ts (createPost), users.service.ts (followUser), the engagement_follow/engagement_post sources in leaderboard.constants.ts; existing ledger rows are reset (nothing is live, #393 (e)) - refs (not counted here): none | 0 | No frame counted here | Follows (1) and posts (3) currently earn points; the founder decided they earn none. Historical ledger/LeaderboardEntry rows need no handling: the platform is not live and no points or ledger rows exist, so existing rows are simply reset (resolved 2026-10-15, #393 (e)). | Decision exists | #383, #382, #219 (superseded), #393 | B-093 | none | BE -> QA | W8 | N |
| B-095 | Figma: admin Contest tab redesign (contest description, weekly task with free-text mechanism, minimum tally, placement points, view-qualifying limit, followers-excluded switch) and admin impression-distribution view - refs (not counted here): the Contest console frames of Decision Log #242 (node ids in docs/sprint-2-admin-contest-screens-report.md) | 0 | Built frames referenced (not counted as gaps) | The Judge Week / Open the Final / Crown Winners screens model admin judging and are superseded; no frame has the new fields or the impression view. | Figma stale or contradicts decision (Figma behind decision #381/#388); Figma design-system leg done 2026-10-15, see w0-figma-pass-b-report.md | #381, #388, #242 (superseded) | - | none | DS -> SB | W0 | N |
| B-096 | Figma: new contest states - weekly Forfeited slot, No winner this month, week-4 uploading state, finalist-only Create Post > Contest tab (upload window, closed for non-finalists and after the deadline), Final-week showcase module (feed and Contest page, with copy), retract-vote interaction, contest-vs-leaderboard handoffs; rename the 'Level 1 Final' frames 5524:7512 / 5541:7527 - refs (not counted here): 5524:7512, 5541:7527, 5818:8997, 5982:10905, 5982:10932 | 0 | Built frames referenced (not counted as gaps) | None of these states exists in Figma (all Missing). | no Figma (new states) | #386, #387, #388 | B-095 | none | SB | W0 | N |
| B-097 | Admin Contest tab (apps/admin): create contest with description, task, minimum tally, placement points, view limit, followers-excluded switch; impression-distribution view; remove Judge Week / Open the Final / Crown Winners pages - refs (not counted here): none | 0 | No frame counted here | Current Contest console (#243) is wired to admin-judging endpoints that are being replaced. | Spec exists; frames per B-095 | #381, #388, #243 (superseded) | B-091, B-092, B-095 | none | FC -> QA | W9 | N |
| B-098 | Voting pages including the Already Voted flow and retract: user-facing counterpart of the six Missing frames carried by B-049 (2072:5584, 5802:8655, 2094:994, 5802:8726, 5802:8978, 5815:8916) - refs (not counted here): the same six | 0 | Missing frames referenced (counted in B-049) | No vote endpoint, no entries list, no ranking page (see B-049); the mechanic is now specified. | Spec: docs/contest-spec.md sections 7-8 | #387, #381 | B-091, B-096 | none | FC -> QA | W9 | N |
| B-099 | Leaderboard Contest tab states and Contest details/between-weeks states against the new calendar (Forfeited, uploading, live ranking from reveal, No winner this month) - refs (not counted here): 5524:7188, 5556:7426, 5556:7529, 5556:7632, 5524:7512, 5524:7836, 5802:9183, 5815:8948 | 0 | Built frames referenced (not counted as gaps) | ContestBoard renders the old derived phases; the new states need the new GET shape. | Figma per B-096; spec exists | #387, #386, #61 (amended), #70 (superseded) | B-091, B-093, B-096 | none | FC -> QA | W9 | N |
| B-100 | Competition umbrella + Create Competition backend (Prediction accuracy-scored, Commentary community-voted, custom types; admin create/configure; scoring; votes; placement points) - refs (not counted here): carried by B-052 | 0 | Stub frames referenced (counted in B-052) | No Competition data model or admin endpoint; now in scope (previously deferred by Build Plan 2.2). Needs its own spec: scoring detail beyond placement points is not in docs/contest-spec.md. | Decision exists (in scope); detailed spec MISSING | #392 (item 1), #72, #73, #385 | B-091, B-093 | none | BE -> FC -> QA | W8 | N |
| B-101 | Community Group feed: group-post model, create/read endpoints, composer and feed on the group page (frames 6453:18580, 6454:18580, 6457:18580, 6458:18580 carried by B-068) - refs (not counted here): the same four | 0 | Partial frames referenced (counted in B-068) | No group-post model or endpoint; CommunityGroupMember has no relation to Post. Moderation and restricted-pending rules for group posts not specified. | Decision exists (feed is needed); no data-model spec | #392 (item 3), #281 (superseded in part), #370, #21 | B-026 | none | BE -> FC -> QA | W8 | N |
| B-102 | Guardian decline cap: per-account decline counter, resend / change-email after a decline (max 3, third decline -> pending deletion), expiry and withdrawal unchanged, requests-per-day cap and 'don't contact me again' option, fix GuardianConsentPage treating 'declined' as pending, wire decline frames 5491:8241 / 5501:8453 - refs (not counted here): 5491:8241, 5501:8453 | 0 | Missing frames referenced (counted in B-003) | Today a decline is terminal and revokes sessions (#337-#340); no counter, no resend-after-decline path. | Spec: Decision Log #389; Figma frames exist but need rewrite (B-003) | #389, #374 (superseded in part), #337-#340 (existing) | B-003, B-030 | none | BE -> FC -> QA | W3 | Y (not yet in legal copy draft; Part C row 44) |
| B-103 | Support DOB correction tool: audited admin action, re-run under-13/16/18 checks and card-verification policy, re-trigger the guardian flow for an adult-turned-minor account - refs (not counted here): none | 0 | No frame counted here | No admin DOB-correction action exists; the age-reclassification sweep does not create Guardian rows. | Decision exists (#390); audit fields and in-flight request effect not specified | #390, #367, #349 (existing) | B-023, B-030, B-104 | none | BE -> FC -> QA | W3 | Y (not yet in legal copy draft; Part C row 22 relates) |
| B-104 | Figma: admin DOB-correction action screen (new) - refs (not counted here): none | 0 | No frame counted here | No frame exists for the support tool. | no Figma | #390 | - | none | SB | W0 | N |
| B-105 | Figma: password-change email frame resolution - 1380:2297 (describes an email-link change flow that does not exist) vs 1380:2318 (matches shipped behaviour) - refs (not counted here): 1380:2297, 1380:2318 | 0 | Missing frames referenced (counted in B-069) | Resolved 2026-10-15 (#392 item 4 correction): BOTH frames ship, each with its own role. 1380:2318 = confirmation email sent after a password reset is completed. 1380:2297 = security alert sent when a suspicious password change occurs on the account. 1380:2297's copy must be rewritten from 'password change requested' to the security-alert role. | Figma exists; 1380:2297 copy to be rewritten; Figma done 2026-10-15, see w0-figma-pass-a-report.md | #392 (item 4, corrected), #393 | - | none | DS | W0 | N |
| B-106 | Verify the six NotInspected frames before launch (5802:9183, 5815:8948, 5542:7344, 5542:7695, 5803:8917, 2896:4837) - refs (not counted here): the six NotInspected frames carried by B-050, B-053, B-054, B-055 | 0 | NotInspected frames referenced (counted in B-050, B-053, B-054, B-055) | Founder answer 5 ('yes, verify them'). Frames not individually diffed against code. | Decision exists | #392 (item 5), #378 | - | none | QA | W8 | N |

## 3. Waves

Every B-ID is in exactly one wave (the wave in which its work is finished). Where a row needs a Figma step earlier than its code step, the Figma step is its own W0 row and the code row depends on it. A row never depends on a later wave (checked by the generator).

### W0 Figma pass

Reason: Design must stop contradicting the decisions before anything is built against it: Age Gate + country, Register read-only DOB, Create Profile, other-user profile, guardian-flow copy, the declined-minor frame, email links, 2FA, new admin actions. Net-new screens for later waves (kickoff-alert control, banter status/topics) are designed at the start of their own wave.

B-IDs (19): B-001 (f_agegate), B-002 (f_gcflow), B-003 (f_decline), B-004 (f_cge), B-005 (f_register), B-006 (f_createprofile), B-007 (f_profile), B-008 (f_login), B-009 (f_email), B-010 (f_legal), B-011 (f_sports), B-012 (f_adminnew), B-013 (f_withdraw), B-014 (f_acct), B-015 (f_2fa), B-095 (f_admin_contest), B-096 (f_contest_states), B-104 (f_dob_admin), B-105 (f_pwd_email)

### W1 Backend foundations

Reason: Nothing user-visible works end to end until the emails carry links, a session survives registration, and the environment is complete. These are prerequisites of every gate and flow below.

B-IDs (7): B-016 (email_links), B-017 (session), B-018 (env_render), B-019 (admin_env), B-020 (verify_enforce), B-021 (consent_lookup), B-022 (sports_e2e)

### W2 Country / geo

Reason: Country must exist (declared at the Age Gate, derived at Register) before the safeguarding policy and OAuth can rely on it.

B-IDs (3): B-023 (country_schema), B-024 (geoip), B-025 (country_policy)

### W3 Gates

Reason: Gates sit on top of W1-W2: uniform write block, profile-complete gate, minor approval email, wrong-DOB flag, routing into the activation flow.

B-IDs (7): B-026 (write_block), B-027 (profile_gate), B-028 (approval_email), B-029 (wrongdob), B-030 (activation_flow), B-102 (decline_cap), B-103 (dob_correction)

### W4 Username

Reason: Username is required for the incomplete-profile gate to mean anything; moderation and cursor leaks must be closed before usernames are exposed more widely.

B-IDs (4): B-031 (username_req), B-032 (username_mod), B-033 (username_revoke), B-034 (cursor_leaks)

### W5 Profile and media

Reason: Profile and media need R2 (and Rekognition) and the new columns before Create Profile, profile pages and post attachments can be built.

B-IDs (8): B-035 (media_store), B-036 (rekognition), B-037 (image_mod), B-038 (profile_cols), B-039 (block), B-040 (media_admin), B-041 (post_attach), B-042 (bants_create)

### W6 Hold / purge + admin actions

Reason: Hold/purge changes erasure behaviour and the two new admin actions; independent of the profile stack, so ordered after it only to keep one safeguarding-sensitive change at a time.

B-IDs (3): B-043 (purge), B-044 (hold_ext), B-045 (admin_actions)

### W7 Contact Us

Reason: Contact Us is self-contained (page, endpoint, rate limit, inbox) and needs a working mailbox; footer links ride with it.

B-IDs (2): B-046 (contact_us), B-047 (footer_links)

### W8 Remaining screens by feature area

Reason: Every remaining Partial/Stub/Missing/NotInspected frame, split by feature area, plus orphan-endpoint UIs and prior-claim corrections.

B-IDs (32): B-048 (sports_hide), B-049 (contest_core), B-050 (contest_states), B-051 (contest_rules), B-052 (competition), B-053 (leaderboard), B-054 (bants_post), B-055 (search_variant), B-056 (dashboard), B-057 (add_role), B-058 (delete_role), B-059 (settings_account), B-060 (settings_privacy), B-061 (settings_privacy_leaves), B-062 (settings_notifs), B-063 (settings_display), B-064 (saved), B-065 (post_page), B-066 (msg_sidebar), B-067 (msg_actions), B-068 (cg_feed), B-069 (emails_unwired), B-070 (orphan_kickoff), B-071 (orphan_banter), B-072 (hygiene), B-091 (contest_be), B-092 (exposure), B-093 (points_engine), B-094 (remove_follow_post_points), B-100 (competition_be), B-101 (cg_feed_be), B-106 (verify_notinspected)

### W9 Frontend counterparts

Reason: Frontends that depend on W0-W8 changes: Age Gate country, Register, guardian screens, Create Profile, profile pages, Edit Profile, withdrawal page.

B-IDs (14): B-073 (agegate_fe), B-074 (register_fe), B-075 (guardian_details_fe), B-076 (gc_pending_fe), B-077 (gc_activation_fe), B-078 (gc_consent_fe), B-079 (gc_confirm_fe), B-080 (withdraw_fe), B-081 (create_profile_fe), B-082 (profile_view_fe), B-083 (edit_profile_fe), B-097 (admin_contest_fe), B-098 (voting_fe), B-099 (lb_contest_fe)

### W10 Social sign-in + 2FA

Reason: Social sign-in must respect the Age Gate, country and guardian flow (W2-W3, W9), so it comes after them; authenticator-app 2FA is grouped here.

B-IDs (4): B-084 (oauth_be), B-085 (oauth_login), B-086 (twofa_be), B-087 (twofa_fe)

### W11 Hosting + launch gate

Reason: Hosting and the launch gate close the register: remove draft markers, fill entity name and Effective Date, counsel re-read, live services.

B-IDs (3): B-088 (hosting), B-089 (legal_gate), B-090 (live_gate)

Waves were not merged or split relative to the brief; one merge note: the admin UI for hold/purge (W6) is built in W6 rather than W9 because it belongs to the same safeguarding change as its backend.

## 4. Accounts and keys

"Repo state" is only what the repository shows (`.env.example`, `render.yaml`, code). It says nothing about whether an account exists in the real world.

| Account / key | Where referenced | Repo state | Blocks |
|---|---|---|---|
| Postmark (transactional email) | `EMAIL_PROVIDER_API_KEY`, `POSTMARK_FROM_EMAIL`; `render.yaml` (both services, `sync: false`) | `.env.example` placeholders `replace-me`; code logs "Would send" without a real key (`registration-email.service.ts`) | B-016, B-028, B-046, B-069, B-090 |
| Sending domain + support@soccernity.com mailbox | `mailto:support@soccernity.com` in `VerifyEmailPage.tsx`, `ReportPage.tsx`, two email templates | referenced in code; nothing in the repo shows it works | B-046, B-090 |
| `WEB_APP_BASE_URL` value | `render.yaml` (both), `.env.example` (`http://localhost:5173`), password-reset email | referenced; production value not in repo | B-016, B-028, B-088 |
| Stripe (card verification) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `COPPA_VERIFICATION_AMOUNT_CENTS` | `.env.example` placeholders; **absent from `render.yaml`**; US under-13 guardians fail closed with 503 | B-018, B-090 |
| Cloudflare R2 (media storage) | `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (in `render.yaml`); `S3_ENDPOINT`, `S3_REGION` (**absent** from `render.yaml`) | `.env.example` placeholders; upload returns 503; no public-URL variable exists | B-035, B-040, B-041, B-042, B-018 |
| AWS (Rekognition) | none in code (only legal draft / CLAUDE.md mention it) | no env var, no dependency, no code | B-036, B-037 |
| MaxMind GeoLite2 database + licence | none in code (only legal draft / CLAUDE.md mention it) | no env var, no dependency, no code; no `trust proxy` set in `services/api/src` | B-024, B-025 |
| Google OAuth client | none | no env var or code | B-084, B-085 |
| Meta (Facebook) developer app | none | no env var or code | B-084, B-085 |
| Sentry | `SENTRY_DSN` (in `render.yaml`) | `.env.example` placeholder; region/plan open (#380) | B-090 |
| Highlightly (sports data) | `SPORTS_DATA_API_KEY` (in `render.yaml`) + 12 related sports variables (**absent** from `render.yaml`) | `.env.example` placeholder; budget/plan open (#323 existing) | B-018, B-090, B-022 |
| Admin JWT secret | `ADMIN_JWT_SECRET`, `ADMIN_JWT_ACCESS_TTL_SECONDS`, `ADMIN_JWT_REFRESH_TTL_DAYS` | `.env.example` placeholder; **absent from `render.yaml`**; boot behaviour unset is unknown | B-018 |
| Neon (Postgres) / Upstash (Redis) / Render (API) | `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`; `render.yaml` (2 API services) | referenced and in `render.yaml` | none new |
| Static hosting + domains for `apps/web` and `apps/admin` | none (`docs/deployment.md` only has `WEB_APP_BASE_URL` guidance) | no definition in `render.yaml`, docs or workflows | B-088, B-090 |
| Secrets with no external account | `JWT_SECRET`, `DOB_ENCRYPTION_KEY` | in `render.yaml`; authenticator-app 2FA may need its own secret-encryption key (not specified) | B-086 |

## 5. Counsel-pending items that gate rows

From `docs/legal-copy-draft-tos-privacy-policy.md` Part C (v0.8). The draft is NOT APPROVED; the only counsel position recorded for v0.8 is "founder states counsel agrees" to guardian contact for all minors. A "gates" entry means the row should not ship its user-facing wording or data handling until counsel has reviewed it; it does not block building behind a flag.

| Part C row | Item | Counsel status (as written) | Gates |
|---|---|---|---|
| 2 | Legal entity name, registration, registered address | Founder (open) | B-089 |
| 12 | Who exercises a minor's data-subject rights; minor/guardian disagreement; "Download my data" | Counsel (open) | B-060 |
| 22 | Decrypted DOB used on the guardian consent request summary - proportionality | needs counsel view | B-021, B-029 |
| 23 | Investigation hold duration / post-closure period | Founder + counsel (open) | B-044 |
| 32 | Guardian contact for every minor; v1 guardians notification | founder states counsel agrees; final wording pending | B-002, B-078, B-082 |
| 33 | Usernames required; placeholder/gate; moderation rules | pending | B-027, B-031, B-032, B-081 |
| 34 | User-initiated guardian-email change wording vs shipped behaviour | Counsel to confirm | B-004 |
| 37 | Amazon Rekognition processor; CSAM hash-matching; duties for images of minors | pending | B-035, B-036, B-037 |
| 38 | Transient IP processing at registration (GeoLite2) | pending | B-024 |
| 39 | Reporter data held in full (bad faith / legal hold) | pending | B-044, B-045 |
| 40 | Purge rule and anonymised-row retention; 6-month hold and appeal window not counsel-sourced | pending | B-043, B-044 |
| 41 | Social sign-in (Google, Facebook) | pending | B-084, B-085 |
| 42 | Contact Us form retention (none set) | pending (Temi + counsel) | B-046 |
| 43 | Avatar, cover, bio, country visible to others incl. minors | pending | B-035, B-038, B-041, B-082, B-081 |
| 44 | Authenticator 2FA storage; minor approval email; mandatory email verification; request summary returns DOB to token holder | pending | B-086, B-087, B-028, B-020, B-021, B-016, B-080, B-013 |
| 36 / 14 / 9 / 20 | Card step not live; NDPA retention cross-check; cross-border transfers (Postmark, S3, Sentry, Render, Neon, Upstash, plus new AWS) | open | B-090, B-089 |
| ToS 3.1 vs 3.2 | Legal draft says account is created "before" vs "exists" (audit s5 item 13) | counsel-approved v0.2 wording; not rewritten | B-072 |

## 6. Unresolved

Items I could not determine or that the inputs contradict. None is guessed.

### 6a. Audit inconsistencies

- **Audit date.** `docs/mvp-coverage-audit.md` header says 2026-10-08; CLAUDE.md's `audit/mvp-coverage-audit` bullet says 2026-10-10. The audit's base commit is `06dcaa0` (PR #388 merge); `origin/main` has since moved (`a054e71`). I could not tell which date is correct.
- **"No frame" vs Q4 frame.** Audit "Top gaps" item 4 says viewing another user's profile has "no frame and no route", but Q4 and the frame table show Figma frames `1455:4362`, `1455:6626`, `1460:8940`, `5702:8250`, `5778:8490`, `5778:8567` (a viewer-facing profile with Follow, message, Copy link, Block). The frames exist; the route does not. This register follows Q4 and the table. Whether those same frames double as the owner's own profile is unanswered in the audit.
- **Overstated Q7 DM contradiction.** Q7/Q14.12 contrasts "Under-18 accounts cannot receive ordinary direct messages" (guardian screen) with "a minor can send DMs". That mixes sending and receiving. Code (per Q9/Q14.10): under-16s are blocked from messaging entirely; an adult cannot start a new thread with a minor (404); restricted-pending minors cannot send or be messaged; a 16-17-year-old can still be messaged by other minors. So the copy is imprecise (and Q14.10's "only accounts they follow can start a DM" has no code behind it), but the stark contradiction as phrased is overstated.
- **342 vs 443.** The audit's 342 is screen frames (Built + gaps); Reference (65) and Archived (36) are on top of it, giving the audit's 443 total. The brief's reconciliation formula (rows + Built + Reference + Archived = 342) cannot hold literally; Section 1 reconciles both figures.
- **Tag counts.** The audit's "other 78" counts Partial + Stub + Missing only; the 6 NotInspected frames are all tagged `other` and are not in that total (84 with them). Recount confirms every other tag count.
- **Archived bucket.** `1870:2753` ("Old - Mobile Drop Down Components") is counted Archived although it is not hidden (the audit notes this); I left it as the audit has it.
- **Frame-only counts.** All 196 Built frames were only checked for route/page/endpoint existence, not copy or pixels (audit Method); any of them may still be stale against #367-#380 beyond the ones this register names.

### 6b. Decision-log gaps that block or shape rows

- **#378 vs Competition deferral.** #378 makes every Stub launch-blocking, including the Competition tab and Admin Create Competition (6 frames, `competition` row). Build Plan 2.2 and Decision Log #72/#73 defer the Competition umbrella and no data model, scoring or admin endpoint exists. Which wins is not stated. **Resolved 2026-10-14 (#392 item 1): build it; Competition umbrella and Create Competition are in scope (B-100).**
- **Contest voting.** 6 Missing frames (`contest_core`) depict community voting; no Decision Log entry I found defines a voting mechanic (the contest is admin-judged). I did not locate a spec; the docx search for "vote" returned only #72, #130, #134, #238, #272. **Resolved 2026-10-14 (#381, #387, #392 item 2): voting is built, contests are not admin-judged; spec in docs/contest-spec.md (B-091, B-098).**
- **Community Group feed.** 4 Partial frames show a group feed; Decision Log #281/#294 (existing) say none is built or intended. #378 says Partial is in scope. **Resolved 2026-10-14 (#392 item 3): build the group feed; supersedes #281/#294 (B-101).**
- **#369 open points.** Placeholder name for incomplete profiles, and treatment of legacy accounts with no username, are explicitly open. **Partly resolved 2026-10-14 (#392 item 9): legacy accounts without a username must complete the profile before accessing the platform; the placeholder name stays open.**
- **#367 open points.** No self-service correction for a mistyped DOB once read-only; where Preferred Club free text is stored (no column; `clubAffiliationId` is an FK to a club page); what "Create Profile is blocked for restricted-pending" looks like on screen. **DOB-correction point resolved 2026-10-14 (#390; B-103, B-104). Preferred Club storage resolved 2026-10-15 (#392 item 8 correction: new free-text field, B-038). The on-screen block for restricted-pending remains open.**
- **#368 open points.** Which table holds declared/derived/method/timestamp (User or Guardian or both); who owns GeoLite2 licence terms and refresh; whether the derived country is also used for non-US demographic grouping beyond what is described.
- **#372, #375, #376.** Counsel proportionality of returning a child's DOB to a token holder; what an open wrong-DOB flag does to the consent flow; the exact "no content" test for purge; the 6-month and appeal-window figures are not counsel-sourced and conflict with the legal copy's 6-7 year moderation retention (PP s9).
- **#371.** CSAM hash-matching coverage on R2 and statutory duties for hosting images of minors; Rekognition EU/UK region availability; whether Rekognition also applies to post attachments (`post_attach`, `bants_create`).
- **#374.** "Archive or rewrite" frame `5491:8241`/`5501:8453` - no choice recorded. **Resolved 2026-10-14 (#389): rewrite and wire the frames to the decline-cap logic (B-102, B-003).**
- **#379 vs code.** #379 says items 1, 5, 11, 13, 14 are "addressed by the flow, copy and legal-draft changes in this same batch", but that batch was docs only; the code still contains "Add your position and photo" (`GuardianConsentPage.tsx:299`) and the "player profile" claim, so item 11 is not fixed in code (rows `gc_pending_fe`, `gc_consent_fe`).
- **#378 and NotInspected.** #378 names Missing, Stub and Partial; the 6 NotInspected frames are not mentioned. They are placed in W8 as verification. **Resolved 2026-10-14 (#392 item 5): verify them (B-106).**
- **Password-change emails.** `1380:2297` ("password change requested") describes an email-link flow that does not exist and overlaps `1380:2318`; which of the two, or neither, should ship is not decided. **Resolved 2026-10-15 (#392 item 4 correction, #393): both frames ship. 1380:2318 = confirmation email after a password reset is completed; 1380:2297 = security alert when a suspicious password change occurs. Copy work in the Figma pass (B-105).**

### 6c. Frames whose spec contradicts a decision where the intended side is unclear

- `5491:8241` / `5501:8453` decline frames - decision #374 contradicts them; archive vs rewrite open. **Resolved 2026-10-14 (#389): rewrite and wire; max 3 declines.**
- Guardian Details `5108:6627` / `5539:7354` - Figma (single name, no country) agrees with #63 and #368, code disagrees; I treated the Figma as intended (row `guardian_details_fe`). **Resolved by founder 2026-10-15 (#393 (a)): Option A, single full-name field and no country select; the code changes (B-075).**
- Register `407:1051` / `1625:2333` and Create Profile - frames contradict #367 (DOB picker, Location); treated as stale, but the audit notes the frames have Username/Full-name rows that differ by breakpoint and I could not tell which breakpoint is intended. **Resolved by founder 2026-10-15 (#392 item 10 correction): 390px is the canonical breakpoint; stale frames are normalised to it in the Figma pass (B-005, B-006).**
- Change Guardian Email `5498:7164` / `5501:8536` - code (built under #365) has name + relationship, the frames do not; I treated the code as intended (row `f_cge`) because #365 is a recorded resolution, but the frames were never updated. **Resolved by founder 2026-10-15 (#393 (b)): the code is intended and the frames are updated to add guardian name and relationship (B-004).**
- Create Profile mobile `1629:2449` is 430px wide, not the canonical 390 (audit Q14.14). **Resolved 2026-10-15 (#392 item 10 correction): normalise to 390 (B-006).**
- `5108:6630` carries a "SCOPE OPEN" note about Grassroots/Sports Hub limits for restricted-pending users; nothing records it as resolved.
- `5108:6631` lists "DMs on" among things switched on; whether that is correct for 16-17 vs under-16 minors depends on the DM rules above and I could not confirm the intended message.
- Bants create-topic frames `2355:2137`, `5651:8166` are Partial but the audit's note only explains the attachment variants.
- Bants post page `2256:11081` / `5651:8253` - audit says built "with no matching Figma frame" yet maps frames as closest; the intended difference is unclear.
- Dashboard `110:5` "New users by league" - `User` has no league attribute; no spec for the grouping.
- Delete Role `5403:7205` - no delete endpoint; semantics of deleting a staff account undefined.
- Settings Display leaf merge (Display into Accessibility) is an open founder call (#246, existing).

### 6d. Not mapped / not verifiable from the repo

- The 122 non-frame top-level Figma nodes (symbols, banners, loose text) were not mapped (audit s6). The "Future Features" banner (`6527:21127`, `6527:21125`) was not inspected, so it is unknown which frames sit under it (audit Q14.16).
- Hidden `Community Home Page Template` `1306:7149` and instance `1308:11643` (`visible: false`) are in the audit but were not assigned any work.
- Whether any external account in Section 4 exists, and whether any key is set in the real Render environments, is not visible from the repo.
- Whether the API boots when `ADMIN_JWT_SECRET` is unset was not run by the audit and not run here.
- The sports e2e key-isolation issue (`sports_e2e`) is taken from CLAUDE.md's bullets; I did not re-run the e2e suite.
- Test suites were not run for this document (docs only).
- Effort and sequencing inside a wave were not estimated; waves give order and reasons only.

## 7. Decision Log #367-#393 coverage

| Decision Log | Referenced by | Build work? |
|---|---|---|
| #367 | B-001, B-002, B-005, B-006, B-009, B-014, B-016, B-017, B-020, B-023, B-025, B-027, B-028, B-030, B-038, B-073, B-074, B-076, B-077, B-079, B-081 | Yes |
| #368 | B-001, B-014, B-023, B-024, B-025, B-059, B-073, B-075 | Yes |
| #369 | B-006, B-012, B-027, B-031, B-032, B-033, B-034, B-081, B-083 | Yes |
| #370 | B-026 | Yes |
| #371 | B-006, B-007, B-012, B-014, B-035, B-036, B-037, B-038, B-039, B-041, B-059, B-081, B-082, B-083 | Yes |
| #372 | B-002, B-021, B-029, B-078 | Yes |
| #373 | B-009, B-028 | Yes |
| #374 | B-003 | No code change; Figma archive/rewrite only. |
| #375 | B-043 | Yes |
| #376 | B-012, B-044, B-045 | Yes |
| #377 | B-002, B-076, B-078 | Future consideration, not MVP; build work is only the copy removal in the guardian screens. |
| #378 | B-005, B-008, B-011, B-015, B-041, B-042, B-046, B-048, B-049, B-050, B-051, B-052, B-053, B-054, B-055, B-056, B-057, B-058, B-059, B-060, B-061, B-062, B-063, B-064, B-065, B-066, B-067, B-068, B-069, B-084, B-085, B-086, B-087 | Yes |
| #379 | B-002, B-003, B-013, B-016, B-017, B-018, B-030, B-047, B-053, B-057, B-072, B-075, B-076, B-080, B-082 | Corrections only; the code-side fixes sit in the rows that cite it. |
| #380 | B-010, B-018, B-019, B-040, B-088, B-089, B-090 | Tracked prerequisites, not a decision; W11 rows. |
| #381 | B-091, B-095, B-096, B-097, B-098, B-099 | Yes (contest rebuild; supersedes #218/#241) |
| #382 | B-091, B-093, B-094 | Yes |
| #383 | B-093, B-094 | Yes |
| #384 | B-093 | Yes |
| #385 | B-091, B-093, B-100 | Yes |
| #386 | B-091, B-096, B-099 | Yes |
| #387 | B-091, B-098, B-099 | Yes |
| #388 | B-092, B-095, B-096, B-097 | Yes |
| #389 | B-102, B-003 | Yes |
| #390 | B-103, B-104 | Yes |
| #391 | B-018, B-088, B-090 | Hosting accounts and region (manual); render.yaml already moved (PR #392). |
| #392 | B-006, B-038, B-052, B-068, B-069, B-100, B-101, B-105, B-106 | Yes (scope; Section 6 answers). Items 4, 8 and 10 resolved by the 2026-10-15 correction (#393). |
| #393 | B-004, B-006, B-038, B-075, B-091, B-093, B-094, B-105 | Yes (founder confirmations 2026-10-15). |

## 8. Updates 2026-10-14 (contest spec, decline cap, DOB correction, hosting, Section 6 answers)

Source: `docs/contest-spec.md`, Decision Log #381-#392. Existing rows above are left as written; where a row is affected, this section says how.

### 8a. Section 6 items: mapping of the founder's ten answers

Section 6 has no numbered list. The founder's answers are mapped by subject; assumed mappings are flagged. Full text in Decision Log #392.

| Founder answer | Section 6 bullet | Status | Decision Log | B-IDs |
|---|---|---|---|---|
| 1. Don't defer anything, build everything now | 6b #378 vs Competition deferral | Resolved | #392 | B-100, B-052 |
| 2. Voting should be built; contest is not admin judged | 6b Contest voting | Resolved | #381-#388 | B-091, B-098 |
| 3. Build the group feed | 6b Community Group feed | Resolved | #392 | B-101, B-068 |
| 4. Ship the correct one | 6b Password-change emails | Resolved 2026-10-15: both frames ship, each with its own role | #392 (corrected), #393 | B-105, B-069 |
| 5. Yes, verify them | 6b #378 and NotInspected | Resolved | #392 | B-106 |
| 6. Decline flow | 6b #374, 6c decline frames | Resolved | #389 | B-102, B-003 |
| 7. Support must be able to correct DOB | 6b #367 open points | Resolved | #390 | B-103, B-104 |
| 8. I agree | Preferred Club free text on the profile (new text field) | Resolved 2026-10-15 | #392 (corrected) | B-038, B-081, B-083 |
| 9. Legacy accounts without username must complete profile | 6b #369 open points | Partly resolved | #392 | B-027, B-031 |
| 10. I agree | 390px canonical breakpoint; normalise Create Profile mobile 1629:2449 | Resolved 2026-10-15 | #392 (corrected) | B-006 |

### 8b. Existing rows affected

| Row | Effect |
|---|---|
| B-003 | Resolution is now "rewrite and wire to the decline-cap logic" (#389), not "archive or rewrite". Code wiring is B-102. |
| B-049 | "No spec for the voting mechanic" is no longer true: spec is `docs/contest-spec.md`. User-facing build is B-098; backend B-091. |
| B-050, B-053, B-054, B-055 | NotInspected frames are verified by B-106. B-050/B-053 states also change per B-096/B-099. |
| B-052 | "Backend deferred by Build Plan 2.2 vs #378" is resolved in favour of building (#392); backend B-100. |
| B-068 | "Contradicts #281/#294" is resolved: the feed is needed (#392). Backend and composer B-101. |
| B-069 | 1380:2297 vs 1380:2318 resolution is B-105: both ship, with distinct roles (resolved 2026-10-15, #393). |
| B-018, B-088, B-090 | Hosting is EU: Render Frankfurt, Neon and Upstash EU regions (#391). Account creation is manual. |
| B-027, B-031 | Legacy accounts without a username are in scope of the incomplete-profile gate (#392 item 9). |

### 8c. New counsel-pending items (not yet in the legal copy draft Part C)

- Minors' view/dwell heartbeat processing and the giver/receiver points model (B-093).
- Guardian decline cap, "don't contact me again" and requests-per-day cap (B-102).
- Support DOB correction and guardian re-trigger (B-103).
- Contest voting and finalist exposure data for minors (B-091, B-092).

### 8d. Reconciliation

Gap frames counted in rows: still 146 (B-091 to B-106 carry 0 frames). B-IDs: 90 + 16 = 106. Wave totals: W0 19, W1 7, W2 3, W3 7, W4 4, W5 8, W6 3, W7 2, W8 32, W9 14, W10 4, W11 3 = 106.

## 9. Updates 2026-10-15 (founder confirmations, Decision Log #393)

Source: Decision Log #393 and the correction appended to #392. Existing rows above were extended in place only where stated; no frame was added and no B-ID was added.

| Item | Effect | Rows |
|---|---|---|
| Guardian Details Option A | Single full-name field, no country select; country at the Age Gate only. Must not ship before B-023/B-025/B-073. | B-075 |
| Change Guardian Email | Frames updated to add name and relationship; code intended. | B-004 |
| Password-change emails | Both frames ship: 1380:2318 after reset completed, 1380:2297 security alert on suspicious change. | B-105, B-069 |
| Preferred Club (#392 item 8) | Free text in a new profile text field; covered by the existing storage row. No new B-ID. | B-038, B-081, B-083 |
| 390px canonical (#392 item 10) | Create Profile mobile 1629:2449 normalised to 390; covered by the existing Figma re-sync row. No new B-ID. | B-006 |
| Contest tie and confirmed assumptions | 10th-place tie rule; items confirmed in docs/contest-spec.md 14b. | B-091, B-093 |
| Historical points | Nothing is live; existing rows reset. | B-094 |

Reconciliation unchanged: 146 gap frames, 106 B-IDs, wave totals as in 8d.

### 9a. Still open (not resolved here)

- Counsel/legal-copy gaps: decline cap, DOB correction, minors' view/dwell heartbeat data, minors' baseline points.
- Competition umbrella detailed scoring spec (B-100).
- Community Group feed data model (B-101).
- Placeholder name for incomplete profiles (#369).
- Log Book sections 6.3, 23.3 and 24.3 (separate PR).
