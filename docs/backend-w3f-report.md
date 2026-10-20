# Backend W3f report: production origin boot check and the Nazif name allow-list

Branch `backend/w3f-env-url-nazif`, 2026-10-20. Source: Decision Log #408 items 1 and 3 (build register B-163, B-165), `docs/backend-w3e-report.md` sections 1 and 4. `services/api` plus `docs/deployment.md` and the register. No `.docx`, schema, Figma, legal copy or DPIA was changed.

## 1. What was built

### B-163: the API refuses to boot in production on a bad app URL
- `validate-runtime-env.ts`: `assertProductionEnv` now also checks `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` (new `REQUIRED_PRODUCTION_ORIGINS`, `findInvalidProductionOrigins`). It reuses `originFromBaseUrl(value, true)` from `cors-options.ts`, so the rule the CORS allowlist applies and the rule the boot check applies cannot drift apart.
- Refused in production: unset or blank, not a URL, a non-http(s) scheme, a placeholder host (`*.example`, `example`, `replace-me`), plain `http`, and localhost / 127.0.0.1 / [::1] even over https. The error names the offending variable(s) and never a secret value.
- Order: the secrets check runs first (unchanged), then the URL check.
- Non-production behaviour is unchanged: nothing is checked outside `NODE_ENV=production`.
- `cors-options.ts` header comment and `docs/deployment.md` rewritten: they described a boot log as the behaviour. The `[cors] ...` log in `main.ts` is kept; in production it can no longer be reached with a bad value, so it only matters outside production.
- `render.yaml` / `.env.example` unchanged (`env-completeness.spec.ts` stays green; both variables were already listed).
- **Operational consequence to know before deploying:** until `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` are real https URLs in the Render dashboard for each service, the service will not go healthy. `staging` included.

### B-165: Nazif, Nazifa, Nazifah
- `username-rules.constants.ts`: new `PROFANITY_ALLOWED_WHOLE_HANDLES = ['nazif', 'nazifa', 'nazifah']`. `username-rules.util.ts`: `isProfane` skips the guarded `nazi` CONTAINS rule when `squash(raw)` (lower case, underscores removed, no digit-to-letter mapping) equals one of the three. It is an allow-list of WHOLE handles checked before the CONTAINS rule, not a named exception: a `nazif` exception would cut the name out of `nazifan`, leave `an`, and accept it.
- The allow-list exempts only the guarded `nazi` rule. `nazifhitler` and `nazif_porn` are still refused by the other terms (tested).
- No other term, no threshold and no innocent exception was changed.
- Tests: the three names accepted (also `Nazif`, `NAZIFA`, `naz_ifa`, `_nazif_`); refused: `nazifan`, `nazifan_10`, `nazif_an`, `nazifah_fan`, `nazifahfan`, `xxnazifxx`, `xnazifa`, `nazifax`, `nazifaan`, `nazif_10`, `nazifa2`, `n4zifan`, `n4zif`, `nazinazif`, `nazifnazi`; the three names added to the innocent-handle list.

## 2. Verification (measured)
| Check | Result |
|---|---|
| `services/api` mocked suite (`--maxWorkers=4`) | **148 suites / 2,578 tests, 0 failures** (W3e report: 148 / 2,533; +45 tests, all in the two touched specs: those two specs went from 114 to 159 tests) |
| `services/api` e2e (real Postgres/Redis), `npm run test:e2e` (`--runInBand`) | **48 suites / 523 tests, 0 failures** (unchanged count; no spec added) |
| `e2e/` Playwright (real browsers, real API) | **176 passed, 0 failed** (W3e-recorded 169, then FC3b added 7; no test changed here) |
| `tsc --noEmit`, `eslint src`, `nest build` | clean |
| `env-completeness.spec.ts`, `cors-options.spec.ts` | pass |

Notes: the brief's `--maxWorkers=4` was used for the unit suite. The e2e suite was run through the repo's `npm run test:e2e`, which is `--runInBand`; every e2e file truncates the one shared test database, so running it in parallel corrupts it (documented in `test/README.md`). The before-figure for the unit suite is the W3e-recorded one, not re-measured on a clean `main`. Disclosure: while the Playwright run was in progress I briefly `git stash`ed the source (about 20 seconds) to measure the two specs' before-count; the run still passed 176 of 176, but treat that pass as a pass of a slightly disturbed run if you want a stricter record.

## 3. Behaviour to confirm (adopted readings, veto-able)
- **Underscore forms of the three names pass.** The decision says "after the normalisation the filter already applies", and that normalisation removes underscores, so `naz_ifa` and `nazi_f` squash to `nazifa` / `nazif` and are accepted. They are not "glued on" anything, but `nazi_f` reads oddly; say if the allow-list should instead be exact on the raw handle (then only `nazif`, `nazifa`, `nazifah` in any case).
- **Digit-for-letter forms are not allow-listed.** `n4zif` is still refused.
- **Handles that contain a name** (`nazif_10`, `nazifa2`, `xxnazifxx`) stay refused, as the register records; whether suffixes should be accepted is not decided.
- The term lists, the 5-letter threshold and the innocent-word list are unchanged and stay open for founder review (B-165).

## 4. Not done / open
- The multi-tab refresh race (B-164) is not part of this change.
- No ops change was made in Render; the two variables must be set there before the next production or staging deploy.

## 5. Register status lines
Appended to the Spec status cell of B-163 and B-165 (BUILT 2026-10-20), and short pointers on B-140, B-018, B-142 and B-032 in `docs/build-register.md`.
