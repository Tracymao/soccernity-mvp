# Backend W3e report: QA defects D-01, D-02, D-06 and the expired-consent email

Branch `backend/w3e-qa-defects`, 2026-10-18/19. Source: `docs/qa-e2e-onboarding-report.md` (D-01, D-02, D-06) and Decision Log #407 (items 1, 2, 3). Register rows B-140, B-141, B-142 and the email half of B-158. No `.docx`, schema, Figma, legal copy or DPIA was changed.

## 1. What was built

### D-01 (B-140): CORS, no wildcard
- New `services/api/src/cors-options.ts`; `main.ts` now calls `app.enableCors(buildCorsOptions(buildCorsConfig(process.env)))`.
- Allowed origins: the origin of `WEB_APP_BASE_URL`, the origin of the new `ADMIN_APP_BASE_URL`, and, only when `NODE_ENV` is not `production`, `localhost` / `127.0.0.1` / `[::1]` on any port. No wildcard, no `Access-Control-Allow-Credentials`. A request with no `Origin` header is untouched. A foreign origin gets no allow-origin header, so the browser blocks it.
- Fail closed, boot not refused: a variable that is unset, not a URL, a placeholder host, or (in production) not https or localhost contributes no origin, and a `[cors] ...` line is logged at boot. See section 4 for the open decision.
- `ADMIN_APP_BASE_URL` added to `render.yaml` (both services), `.env.example` and `docs/deployment.md`. The env-completeness spec passes (it reads `process.env.ADMIN_APP_BASE_URL` indirectly through `main.ts`).
- **One change outside `services/api`, needed for the fix to work:** `apps/web/src/api/auth.ts` `registerUser` no longer sends `credentials: "include"` (Decision Log #407 item 1 says so; the API sets no cookie). Without it a browser still refuses the response, because the API does not send `Allow-Credentials`. This was not in the brief's item list, so flagging it.

### D-02 (B-141): age-5 floor server-side
- `age.util.ts`: `MINIMUM_SIGNUP_AGE = 5`, `meetsMinimumSignupAge()`, code `below_minimum_age`, message "Soccernity accounts start at age 5."
- `POST /auth/register` returns **400** `{code: "below_minimum_age"}` before any write, whatever the guardian block says. Exactly 5 is accepted. Same `calculateAge` as the web Age Gate.
- The DOB-correction tool (`POST /admin/users/:id/dob-correction`, #390) refuses the same with the same code, so it is not a back door (checked, as #407 asked).

### D-06 (B-142): username filter
- Moved to CONTAINS (5+ letters, unambiguous): `hitler`, `pussy`, `paedo`, `swastika`, `whitepower`, `gangbang`, `deepthroat`, `creampie`, `orgasm`, `masturbat`, `erotic`.
- `nazi` is four letters and sits in real names, so it is CONTAINS with named innocent exceptions (`nazir`, `nazim`, `nazia`, `nazih`, `nazik`): those are cut out, the rest is searched. `nazifan`, `xxnazixx`, `nazirnazi` are refused; `nazir_10` is accepted. Known false positive: Nazif / Nazifa cannot be told from `nazi` + `fan`, so they are refused.
- Short or ambiguous terms stay exact (`dick`, `cock`, `rape`, `ass`, `sex`, `sexy`, `anal`, `cum`, `pedo`, `isis`, `kkk`, `twat`, `wank`, ...).
- Tests: 18 glued/leet refusals, guarded-term cases, short-term-exact cases, and a 37-handle innocent list (Essex, Sussex, Hancock, Hitchcock, Peacock, Dickson, Nazir, Torpedo, ...). Known earlier false positives (`scunthorpe`, `penistone`, `therapist`) are unchanged and deliberately not in the list.
- **Term lists and the 5-letter threshold are my adopted defaults, for founder review** (#407: "set in the build PR").

### Expired-consent email wording (B-158, email half)
- `guardian-consent-expired` said "Your guardian did not respond to either approval request", untrue after decline, stale-decline reopen, then lapse. It now says "Your Soccernity account was not approved in time, so it cannot be activated." and "If you still want an account, talk to your guardian and sign up again." Text and HTML bodies. No history, no decline count.
- Tagged `[COPY PENDING LEGAL REVIEW]` in a code comment; listed as an OPEN `services/api` row in `docs/pending-copy-manifest.md` (and removed from the "not tagged" bullet).

## 2. e2e/ harness changes (what I removed)
- **Deleted** `e2e/support/cors-proxy.ts`. `stack.ts` drops `PORTS.rawApi` / `URLS.rawApi`; the API now listens on :3100 directly; `global-setup.ts` no longer starts the proxy and passes `ADMIN_APP_BASE_URL`. README updated.
- **Removed `test.fail()`** from: D-01 (`00-known-defects.spec.ts`), D-02 (`03-age-gate-and-under-13.spec.ts`), D-06 (`07-create-profile-username.spec.ts`). The tests stay as ordinary regression tests.
- **Added 4 tests:** D-01 allowed origins answered exactly + never `*` (node `http`, so Origin can be set); D-01 unlisted origin gets no header; D-02 exactly age 5 accepted; D-06 innocent name accepted. The D-01 browser test now sends exactly what `registerUser` sends (no credentials).
- **One unrelated test change, disclosed:** `06-login-routing` "an expired access token is silently refreshed" became intermittent once the proxy's extra latency was gone (failed in 3 of 5 runs). Cause: the test planted a bad token while the old `/community` page was alive, so both pages rotated the same refresh token and the server correctly treated the second use as reuse. The test now navigates to `about:blank` first and seeds the token with an init script. 3 of 3 passes afterwards. **This is a real multi-tab race in the app (rotating refresh token, no cross-tab lock), not fixed here; see section 4.**
- The QA report `docs/qa-e2e-onboarding-report.md` was not edited and still describes the proxy as it was.

## 3. Verification (measured)
| Check | Before | After |
|---|---|---|
| `services/api` mocked suite (`--maxWorkers=4`) | 147 suites / 2,433 tests (last recorded, not re-measured on clean main) | **148 suites / 2,533 tests, 0 failures** |
| `services/api` e2e (real Postgres/Redis) | 48 / 523 (last recorded) | **48 suites / 523 tests, 0 failures** (no spec added; nothing here needs a real DB beyond what is covered) |
| `e2e/` Playwright (real browsers, real API) | 165 passed | **169 passed, 0 failed** |
| `apps/web` vitest | 72 files / 651 tests | 72 files / 651 tests, 0 failures |
| `tsc --noEmit` (api, web), `eslint src` (api), `nest build` | clean | clean |

New unit tests: `cors-options.spec.ts` (config rules plus real HTTP with supertest: exact origin, no `*`, preflight, foreign origin, no-Origin), age floor (registration 6, `age.util` 3, DOB correction 1), username CONTAINS / guarded / innocent-list cases, expired email (1). The three touched pure-logic specs (cors-options, age.util, username-rules) run to 148 tests, 0 failures. Env-completeness and pending-copy manifest checks pass.

Operational note: two overlapping full e2e runs against one test database (from an interrupted session) produced 8 spurious failing suites; both were stopped and one clean run is the figure above.

## 4. Open / not decided
- **Unset origin variable in production:** I chose fail-closed with a boot log, not refusing to boot (#407 left it undecided). Say if `assertProductionEnv` should refuse instead.
- **Multi-tab refresh race** in `apps/web` `silentRefresh.ts` (two tabs, one rotating refresh token, no lock): a real user with two tabs open can be logged out. Not fixed; needs a decision (cross-tab lock or a short reuse grace).
- Error code `below_minimum_age` and its message are my choice (#407 left them open).
- The guardian confirm page's post-decline state (D-10), D-13 follow promise, D-09 and the rest of the QA defects are untouched.
- The other `services/api` guardian email templates are still untagged (manifest).

## 5. Register status lines
Appended to the Spec status cell of B-140, B-141, B-142 (BUILT 2026-10-18) and B-158 (PARTLY BUILT: email wording only; the decline-lapse reminder wording is unchanged and still not counsel-reviewed) in `docs/build-register.md`.
