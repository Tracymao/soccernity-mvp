# Soccernity — Data Protection Impact Assessment (DPIA)

## FIRST-PASS DRAFT — NOT APPROVED, NOT LEGAL ADVICE, NOT A COMPLETED DPIA

**Status: draft for counsel review.**

This document is a first-pass draft produced by the `safeguarding-drafter` agent
(see `CLAUDE.md`, non-negotiable #2). It has **not** been reviewed by Soccernity's
safeguarding/legal counsel — a role recorded as a priority hire in Inventor's Log
Book Section 15 and, at the time of writing, unfilled.

Nothing in this document should be read as a statement that Soccernity is
compliant with UK GDPR, EU GDPR, US COPPA, the Nigeria Data Protection Act 2023, the Data
Protection Act 2018, the Online Safety Act, the ICO Age Appropriate Design Code, or any other
regime. No section of this draft has
been assessed for legal sufficiency by anyone qualified to do so. **A DPIA is only
a DPIA once a competent person has completed, challenged, and signed it.** Until
the sign-off block in Section 6 is completed, this file is working material for
that person to react to — a starting point that expects to be substantially
rewritten, not a deliverable to be adopted.

Every period, threshold, age, retention window, and policy line below is marked as
a **[PROPOSAL]** — a suggestion for counsel to confirm, revise, or reject — or as
**[OPEN DECISION]**, meaning it is a Decision Log item (MVP Build Plan Section 9)
belonging to the founder and counsel, which this draft deliberately does not
resolve.

- **Document:** DPIA outline, MVP Build Plan Section 8.1
- **Sprint / PR:** Sprint 1, PR S1 (v0.1); factual refresh `docs/dpia-draft-refresh` (v0.2); scope extension `docs/dpia-v0.3-eu-gdpr-coppa` (v0.3)
- **Draft date:** 2026-08-16 (v0.1); revised 2026-09-20 (v0.2); revised 2026-09-21 (v0.3)
- **Drafted by:** `safeguarding-drafter` agent (automated first pass, v0.1); v0.2 revised with
  Claude Code, from the merged code rather than from summaries; v0.3 likewise
- **Reviewed by counsel:** NOT YET — see Section 6
- **Version:** 0.3 (draft — still NOT APPROVED)

### Changelog — v0.2 → v0.3 (2026-09-21)

**What this update is, stated plainly.** On 2026-09-21 the founder decided to extend Soccernity's
compliance framework beyond the UK GDPR + Nigeria NDPA 2023 baseline to also cover **EU GDPR** and
**US COPPA** (this is the input to Decision Log #4). v0.3 extends the DPIA's legal-basis and risk
analysis to those two regimes. **It is an internal risk assessment: its job is to surface gaps, not to
assert compliance, and it does not.** The Section 6 sign-off block is unchanged and empty
("Reviewed by counsel: NOT YET"); Decision Log #4 is **not** closed by this document (its docx entry
was deliberately not edited); nothing is approved. The two regime analyses below were written from the
drafter's general knowledge of those regimes — **no statute, regulation or regulator guidance was
retrieved or checked during this pass** (see §0 item 5) — and from a direct reading of the merged
consent code, which is what the findings about Soccernity itself rest on.

Added:

1. **§2.5 EU GDPR** — Article 27 representative analysis; Article 8 member-state digital-consent-age
   variation checked against Soccernity's under-18 guardian-consent threshold (Decision Log #8) and
   under-16 tier (Decision Log #346). New risk **R15**.
2. **§2.6 US COPPA** — verifiable-parental-consent standard tested against the *actual* current
   guardian-consent mechanism, read from the code. New risk **R16**. **Headline finding: email-link
   confirmation, as built, is very unlikely to meet COPPA's verifiable-parental-consent standard for
   under-13s on a platform that publicly discloses children's information** (§2.6.3).
3. **§1.6** rewritten to record the founder's scope decision; **§4** rows for R15/R16 and an amended R1
   residual row; **§5** items 22–28; **§6** scope note.

Also confirmed while reading the code (not a scope change): R1's residual row said guardian-email
verification was "not specified anywhere yet" — still true, and now established as a *code* fact: there is
**no check that the guardian's email differs from the child's own** (§2.6.3, finding 1).

**What is not changed:** R1–R14 are unedited except as listed. R3 and R7–R11 remain unrefreshed (§0 item
4). No lawful basis is chosen (§2.1). The public Terms/Privacy Policy draft
(`docs/legal-copy-draft-tos-privacy-policy.md`) is **out of scope for this PR and was not touched**; it will
need to be brought into line with whatever counsel decides here.

---

### Changelog — v0.1 → v0.2 (2026-09-20)

**What this update is, stated plainly.** v0.2 narrows the DPIA's *factual* gaps ahead of
counsel's first full review — it corrects statements that the merged code has made untrue and
adds risks for safeguarding features that did not exist when v0.1 was written. **It does not
itself constitute progress toward sign-off.** The Section 6 sign-off block is deliberately
unchanged and empty; no lawful basis has been determined, no residual risk has been rated,
Decision Log #4 and #8 positions are exactly as v0.1 left them, and no [PROPOSAL] or
[ACTION FOR REVIEW] has been accepted or closed by this revision. A DPIA is still only a DPIA
once counsel completes and signs it. Every change below was made by reading the merged code
(paths cited inline), not by summarising project notes.

Shipped since v0.1 and now reflected:

1. **Under-16 tier** (PR #272, Decision Log #346) — new **R13**; §1.3; §4 table.
2. **Adult-cannot-message-minor rule**, enumeration-safety fix, and timing parity (PRs
   #273 / #276 / #280, Decision Log #347 / #350) — **R2 rewritten**; §4 table.
3. **Consent audit trail enrichment** (PR #274, Decision Log #348) and the account
   anonymization / consent-record retention design (Decision Log #42 as superseded in part by
   #341) — **R6 rewritten**; §1.3; §2.4; §4 table.
4. **Age-reclassification sweep** and its notifications (PRs #275 / #279 / #281 / #282,
   Decision Log #349) — new **R14**; §1.3; §4 table.

Other statements corrected because the same shipped work (or earlier merged work) made them
false — flagged here so counsel can see every place v0.1's text was changed, not only the four
above: **R1**'s and **R12**'s "not built" status; **R4** (consent *withdrawal and decline are now
built* — PR #261, Decision Log #34/#337–#340; the v0.1 claim that "there is no `withdrawn` state
and no route" is no longer true); **R5**'s built-status; §1.5's "AuthModule commented out" and
"guardian-consent endpoints do not exist yet" lines; §2.4's "no soft-delete / erasure
unspecified" and "no Guardian → withdrawal path" bullets; and the §1.3 field lists. Risks
R3, R7–R11 were **not** re-verified against the current code in this pass except where noted, and
their "Built today?" cells should be treated as unrefreshed (see §0 item 4).

**Open items surfaced while reading the code (not resolved here):** see the new rows 16–21 in §5.

---

### 0. Sourcing limitations counsel must know about before reading

Stated up front because it affects how much weight any of the below can carry.

1. **The two source documents could not be read directly by the drafting agent.**
   `docs/Soccernity_Inventors_Log_Book_v2.13.docx` and
   `docs/Soccernity_MVP_Build_Plan_v1.7.docx` are binary `.docx` files outside the
   agent's readable formats. The section structure used below (description of
   processing → necessity and proportionality → risks to minors → mitigations
   cross-referenced to product controls → sign-off) is taken from the
   `safeguarding-drafter` agent specification's account of Build Plan Section 8.1,
   **not** from the Build Plan text itself. **[ACTION FOR REVIEW]** Reconcile this
   outline against the actual wording of Section 8.1 before treating the structure
   as correct; if 8.1 requires headings this draft omits, this draft is incomplete.
2. **Verified sources actually used:** `CLAUDE.md`,
   `services/api/prisma/schema.prisma` (the 20-entity data model),
   `.env.example`, `services/api/src/app.module.ts`, `README.md`, and
   `.claude/agents/safeguarding-drafter.md`.
3. **Version drift exists in the repository and is unresolved.** `CLAUDE.md` and
   `README.md` reference Log Book v2.13 / Build Plan v1.7. Recent commit messages
   reference v2.10 / v1.4, and `schema.prisma`'s header comment cites Build Plan
   **v1.1** as its source of truth. **[ACTION FOR REVIEW]** Confirm which Build
   Plan version is authoritative before relying on any section reference in this
   draft. A DPIA that cites the wrong version of the specification it assesses is
   not reliable evidence of anything.
4. **v0.2 sources, and what v0.2 did NOT re-verify.** The v0.2 changes were drafted from the
   merged code on `main` (as of PR #284): `services/api/prisma/schema.prisma`
   (`User`, `Guardian`, `ConsentAuditRecord`, `AgeReclassificationLog`);
   `modules/messaging/messaging.service.ts` and `conversations.controller.ts`;
   `modules/auth/guards/under-16-restriction.guard.ts` and the banter / community-groups /
   messaging controllers that apply it; `modules/users/users.service.ts` (`guardianContact`);
   `modules/auth/guardian-consent/*` (confirm / decline / withdraw / expiry sweep, device-type
   util); `modules/auth/registration/age.util.ts`;
   `modules/account-deletion/account-deletion-sweep.service.ts`; and
   `modules/age-reclassification/age-reclassification-sweep.service.ts`. **No live-environment
   behaviour was tested** — this is a reading of code, and "Built today? Yes" below means "the
   code is merged", not "operating in production" (no live deployment is recorded anywhere in the repo; hosting is still unverified, see §1.5). The
   remaining v0.1 material (R3, R7–R11, and the parts of §1–§2 not named in the changelog) is
   **unrefreshed** and may be stale in ways this pass did not check.

5. **v0.3 sources — and a limitation specific to §2.5 / §2.6.** The Soccernity-facing findings in v0.3
   were drafted from the merged code on `main` as of 2026-09-21:
   `services/api/src/modules/auth/registration/registration.service.ts`, `dto/register.dto.ts`,
   `dto/guardian-details.dto.ts`, `age.util.ts`;
   `auth/guardian-consent/guardian-consent.service.ts`, `consent-token.constants.ts`, the `dto/*` for
   confirm / decline / withdraw; `registration-email.service.ts`; and the web confirmation screen
   `apps/web/src/pages/GuardianConsentConfirmPage.tsx` and age gate `AgeGateStep.tsx`. **The statements
   about EU GDPR and COPPA, however, come from the drafting agent's general knowledge, not from a retrieved
   source.** No regulation text, FTC document, EDPB guideline or member-state statute was fetched in this
   pass, and the legislative position (in particular the member-state digital-consent ages in §2.5.2, the
   COPPA Rule as amended in 2025, and which consent methods the FTC currently recognises) changes over time.
   **[ACTION FOR REVIEW]** Counsel must verify every legal proposition in §2.5 and §2.6 against primary
   sources before relying on any of it. Where this draft is uncertain it says so; where it is silent it has
   not checked.

---

## 1. Description of the processing

*Draft for counsel review. The purpose of this section is to give counsel an
accurate factual base to assess; it is descriptive, and asserts no conclusion
about lawfulness.*

### 1.1 What Soccernity is, in processing terms

Soccernity is a platform for unaffiliated grassroots football players and the
fans, coaches, and communities around them. MVP v1 covers Community, Sports Hub,
Grassroots record-keeping, Messaging, Notifications, a Leaderboard, and an Admin
& Operations Console. The Discover pillar (AI scouting, Talent Passport, Scout
CRM) and the Careers pillar are explicitly **out of MVP scope** per Build Plan
Section 2.2 and `CLAUDE.md` non-negotiable #4.

**This materially narrows the DPIA.** Profiling of minors for talent
identification, scout access to minors' data, and any adult-scout-to-minor contact
channel are **not** part of what is assessed here, because they are not built. If
the Discover pillar is later brought into scope, **this DPIA must be redone, not
amended** — it would introduce exactly the processing (profiling of children,
adult-stranger access to children) that carries the highest risk. **[PROPOSAL]**
Record "a new DPIA is required before any Discover-pillar work begins" as a
standing gate in the Definition of Done (Build Plan Section 7).

### 1.2 Categories of data subject

- Adult users (fans, players, coaches).
- **Child users** — users below the age threshold that remains an open decision
  (see Section 1.6). These are the subjects this DPIA is primarily concerned with.
- **Guardians** of child users — themselves data subjects, processed only in
  connection with the consent flow.
- Admin users (staff — `AdminUser`).
- Third parties named in user-generated content, including people who never
  registered and are visible in uploaded photographs or video (`Post.mediaUrls`,
  `MediaAsset`, `Message.mediaUrl`). **[ACTION FOR REVIEW]** This category is
  frequently under-assessed and is a common source of child-image risk, because a
  child can appear in a grassroots match photo uploaded by an adult without ever
  being a user. This draft flags it but does not attempt to resolve it.

### 1.3 Categories of personal data (verified against `schema.prisma`)

**Account and identity — `User`:** `email`, `phone` (optional), `passwordHash`,
`displayName`, **`dateOfBirth`**, `isMinor`, **`isUnder16`** (added PR #272; a second,
narrower age tier — see R13), `role`, `verificationStatus`, `accountStatus`
(`active | deactivated | pending_deletion | suspended | deleted`), `pendingDeletionAt`,
`createdAt`, `clubAffiliationId`. `dateOfBirth` and `phone` are nulled, and `email`,
`displayName` and `passwordHash` overwritten, when an account is anonymized (see R6).

Note for counsel: `dateOfBirth` is stored in full, not as a derived age band or a
boolean. Full date of birth is a strong identifier and elevates the impact of any
breach. **[PROPOSAL]** Counsel to consider whether the age-gate's operational
needs can be met by storing a derived age band plus a hash or truncated value,
retaining full DOB only where a specific purpose requires it. This draft does not
propose a schema change — under `CLAUDE.md`, altering the data model is a Decision
Log matter (Build Plan Section 9), not a change to make in a policy document.

**Guardian consent — `Guardian`:** `minorUserId`, guardian `name`, guardian
`email`, `relationship` to the child, `consentStatus` (`pending | confirmed | declined`,
CHECK-constrained in Postgres), `consentToken`, `consentTokenExpiresAt`,
`consentTimestamp`, `consentScreenVersion` and `consentDeviceType` (PR #274 — written in the
same update as `consentTimestamp`), `consentDeclineSource`
(`guardian_explicit | guardian_withdrawal | expiry_timeout`), `consentAutoResentAt`, and a
separate single-use `withdrawalToken`. **No IP address and no raw User-Agent string is stored
anywhere in this record — a deliberate, permanent omission, see R6.**

**Consent evidence — `ConsentAuditRecord`:** a snapshot written when an account is
anonymized: `minorUserId` (a plain string, deliberately not a foreign key),
`consentStatus`, `consentConfirmedAt`, `consentMethod`, `consentScreenVersion`, `deviceType`,
`createdAt`. It holds no guardian name, email or relationship, and no decline-source.

**Age-change log — `AgeReclassificationLog`:** append-only; `userId` (plain string, no FK),
`field` (`isMinor | isUnder16`), `fromValue`, `toValue`, `ageAtChange` (a derived integer —
the date of birth itself is not copied), `occurredAt`.

**User-generated content:** `Post` (text, media URLs), `Comment`, `BanterRoom`
membership, `SavedPost`, `Follow` (social graph), `MediaAsset` (image/video, size,
uploader).

**Private communications:** `Conversation` (`participantIds`), `Message`
(`contentText`, `mediaUrl`, `sentAt`, `readAt`).

**Behavioural and engagement:** `Notification`, `LeaderboardEntry` (points, rank,
period — a **publicly ranked** record potentially including children).

**Safeguarding and moderation:** `Report` (reporter identity, target type/ID,
free-text `reason`, status). Reports are the highest-sensitivity records in the
system: a report may contain an allegation about a named child, written by a
named child.

**Grassroots records:** `GrassrootsTeam` (name, city, league type, creator),
`Fixture` (time, venue), `Result` (scores, who entered). **Note for counsel:**
`Fixture` combines a **venue** and a **scheduled time** with team rosters that may
consist of children. Location-plus-time data about children is a recognised
physical-safety risk category distinct from ordinary privacy risk — see Risk R7.

**Third-party sourced:** `MatchData`, cached from a licensed sports-data vendor
(vendor selection is Decision Log #6, still open). This is professional-fixture
data, not user data.

### 1.4 Nature, scope, context, purposes

- **Nature:** collection, storage, display to other users, private transmission,
  moderation review, automated ranking (leaderboard), email transmission to
  guardians.
- **Scope:** all registered users. MVP volumes are unknown pre-launch.
  **[ACTION FOR REVIEW]** Counsel may wish to record an expected user-count and
  expected proportion of minors; this draft has no basis to estimate either.
- **Context:** grassroots football, a domain where the participant base skews
  young and where the platform's own stated purpose (Log Book Section 10)
  anticipates minors as a core, intended user group — not an edge case. This is
  the single most important contextual fact in this DPIA. A platform that
  *expects* children must design for them from the outset rather than treating
  them as an exception to an adult product.
- **Purposes:** identity and profile; community participation; grassroots
  record-keeping; following professional football; safeguarding and moderation;
  service operation and security.

### 1.5 Technical context relevant to risk

- Modular monolith, NestJS + PostgreSQL (Prisma) + Redis, per Build Plan Section 5.
- **Hosting and data location are not yet decided** — Decision Log #9, still open;
  `.github/workflows/deploy.yml` deliberately fails rather than guessing a
  provider. **[OPEN DECISION]** Hosting location determines whether international
  transfers occur at all. This DPIA therefore **cannot** assess transfer risk, and
  does not attempt to. Counsel should treat transfer assessment as an explicit
  open item, not an omission.
- **Auth is built in-house** (argon2id, JWT carrying only `{ sub, role }`, refresh-token
  store in Redis) and the guardian-consent endpoints exist (confirm, resend, decline,
  withdraw request/withdraw, status). *v0.1 said `AuthModule` was commented out and these
  endpoints did not exist; that was true on 2026-08-16 and is not true now.* Decision Log #7
  (auth provider) is not re-verified in this pass.
- **Sub-processors:** an email provider (`EMAIL_PROVIDER_API_KEY`) will transmit
  guardian consent emails; S3-compatible storage will hold user media; Sentry is
  wired for error monitoring but currently inert (no DSN, `Sentry.init()` never
  called). **[ACTION FOR REVIEW]** Each becomes a processor requiring an Article
  28 contract and its own transfer assessment once selected. None is selected yet.
  **[PROPOSAL]** Counsel to consider whether Sentry error payloads should be
  configured to scrub request bodies and user identifiers before any real DSN is
  added, given that error traces from consent endpoints would otherwise capture
  children's and guardians' data in a third-party system.

### 1.6 Two decisions this draft does not make, and will not

Stated here rather than buried later, because the rest of the document depends on
them and readers should not mistake silence for resolution.

**[OPEN DECISION — Decision Log #4] Jurisdictional scope beyond UK GDPR — scope extended by
founder decision on 2026-09-21; entry still open.** Decision Log #4 recorded whether Soccernity's data
protection framework extends beyond UK GDPR (to EU GDPR, COPPA, or other regimes) as open. On
2026-09-21 the founder decided to extend the framework to **also cover EU GDPR and US COPPA**, alongside
the UK GDPR + Nigeria NDPA 2023 baseline. v0.3 of this DPIA analyses both (§2.5, §2.6). That is a decision
to *assess* those regimes, **not a finding that Soccernity complies with them**, and the Decision Log entry
itself has not been closed or edited by this document — counsel is expected to close it once the analysis
below has been reviewed. What was already true, and remains true:

- Article 8 GDPR sets a digital-consent age that member states may set anywhere between 13 and 16 (§2.5.2).
  Soccernity's thresholds sit at or above the highest floor, but that is only part of the Article 8 question.
- COPPA applies below 13 with a materially different and more prescriptive verifiable-parental-consent
  standard than "email to a guardian." **The consent flow described in Build Plan Section 8.3 and built as
  the guardian-consent module very likely does not meet it** — §2.6.3 sets out why, from the code.
- There is still **no technical or contractual means of limiting the user base by country** (no geo-block,
  no country field on `User`). The framework is therefore "extended" only in the sense that it is assessed;
  the product neither includes nor excludes EU or US users today, which matters for §2.5.1 and §2.6.1.
- The Online Safety Act and the ICO's Age Appropriate Design Code may impose duties independently of which
  consent regime applies. **[ACTION FOR REVIEW]** This draft does not assess either and is not competent to.
  The same is true of the EU Digital Services Act and US state children's-privacy and age-appropriate-design
  statutes: named here so they are not mistaken for having been considered.

**[OPEN DECISION — Decision Log #8] Regional minimum age for the age-gate.**
`CLAUDE.md` records this as still open and as a direct blocker on Sprint 1 Auth
work. This draft therefore refers throughout to "the age threshold" or "the
applicable consent age" and **never** substitutes a number. Any number appearing
in downstream code, copy, or design before this item is closed was **not** sourced
from this document.

**These two are interdependent** and should be closed together: the threshold is a
function of the jurisdictional scope. Closing #8 without closing #4 produces a
number with no defensible basis.

---

## 2. Necessity and proportionality assessment

*Draft for counsel review. The assessments below are the drafting agent's
reasoning offered for challenge, not conclusions. Counsel should expect to
disagree with some of them.*

### 2.1 Lawful basis

**[PROPOSAL — NOT DETERMINED]** This draft does **not** select a lawful basis.
Basis selection is a legal determination, and choosing one here would be exactly
the kind of quiet default `CLAUDE.md` warns against. For counsel to determine:

- The likely candidates for core service processing are contract and legitimate
  interests, with consent for anything ancillary.
- **Legitimate interests requires particular care where the data subject is a
  child** — the balancing test weights a child's interests more heavily, and the
  ICO's position is that children's interests may override the controller's.
- Where guardian consent is the basis for a child's use of the service, counsel
  should address how that interacts with the basis for processing the child's
  ordinary service data, and what happens to that data if consent is later
  withdrawn (see Risk R4 — the product currently has no withdrawal mechanism).
- The guardian's own data (name, email, relationship) needs its own basis.
- **[ACTION FOR REVIEW]** Whether any processing amounts to special-category data
  under Article 9 — for example, health or injury information volunteered in posts
  or grassroots records, or inferences about a user drawn from club affiliation.
  This draft does not assess it.

### 2.2 Is each category of data necessary?

Assessed field by field against the built schema. **All conclusions provisional.**

| Data | Draft view on necessity | For counsel |
|---|---|---|
| `email`, `passwordHash` | Necessary — account identity and security | Confirm |
| `dateOfBirth` (full) | Purpose (age-gating) is necessary; **storing the full date may exceed what that purpose requires** | **[PROPOSAL]** Consider derived age band. Data-minimisation question, not a settled point |
| `phone` (optional) | **Questionable.** No MVP feature identified that requires it | **[PROPOSAL]** Counsel to consider whether it should be collectable from minors at all |
| `displayName` | Necessary | **[PROPOSAL]** Consider guidance discouraging minors from using full real names |
| Guardian `name`, `email`, `relationship` | Necessary to the consent flow | Confirm `relationship` free-text is proportionate |
| `Conversation` / `Message` content | Necessary to a messaging feature | **The harder question is not necessity but whether minors should have unrestricted DM access at all — see R2** |
| `Fixture.venue` + `scheduledAt` | Necessary to fixtures | **Proportionality turns on visibility, not collection — see R7** |
| `LeaderboardEntry` (public rank) | Necessary to the feature | **[PROPOSAL]** Public ranking of identifiable minors is a design choice, not a technical necessity — counsel to consider whether minors should be excluded from public boards or shown pseudonymously |
| `Report.reason` (free text) | Necessary to moderation | Free text will attract sensitive disclosures by design; handling needs care |
| `MatchData` | Not personal data of users | Confirm vendor licence terms |

### 2.3 Proportionality observations

1. **Data minimisation is broadly respected in the schema**, which is a genuine
   strength: there is no location tracking, no device fingerprinting, no
   advertising identifier, no behavioural-advertising infrastructure, and no
   third-party analytics SDK in the data model. Counsel should verify this holds
   in the built client applications, which do not yet exist and therefore cannot
   be checked here.
2. **No profiling of minors occurs in MVP** beyond the leaderboard's points
   calculation. This is a direct consequence of deferring the Discover pillar.
3. **The consent mechanism is proportionate in effort but its sufficiency is
   untested.** An email to a guardian address supplied by the child is a
   low-friction mechanism, appropriate to a grassroots context — but it is
   inherently vulnerable to a child supplying their own address (see R1), and
   whether it constitutes *verifiable* consent depends entirely on the
   jurisdiction question at 1.6. **This draft cannot say whether it is
   sufficient.**
4. **The restricted-pending state is proportionate in the right direction** — it
   fails closed, restricting the account until consent arrives rather than
   granting access and revoking later.

### 2.4 Data subject rights — draft view

**[ACTION FOR REVIEW — significant gap]** No mechanism for any data subject right
is present in the data model. Specifically:

- **Erasure is now specified, as anonymization in place — but counsel has not reviewed it.**
  (v0.1 said it was unspecified.) A self-service or admin deletion request puts the account in
  `pending_deletion`; after a 30-day grace period a daily job anonymizes the `User` row
  in place (it never `DELETE`s it — Decision Log #341): identifying fields are overwritten or
  nulled, the user's follows, likes, saves, notifications and Banter / Community Group / Club
  memberships are deleted, and teams they organised become dormant. `Post`, `Comment`,
  `Message` and `Result` rows are **kept**, now attributed to "[deleted user]"; `Report` rows
  are never touched. An open moderation `Report` involving the account **holds** the
  anonymization indefinitely (no maximum duration; Decision Log #345 adds admin visibility
  only). **[ACTION FOR REVIEW]** Whether retaining a departed user's posts, comments and
  private messages under an anonymous label satisfies Article 17 for that user — particularly
  `Message.contentText` in a thread the *other* participant still holds, and free-text posts
  that may themselves identify the author — is a question for counsel; the design rests on the
  Recital 26 reasoning recorded in the sweep's own header comment, which is an argument, not a
  determination. The anonymized `User` row itself has no purge timer (Decision Log #344).
- **`MediaAsset.uploaderId` is a plain `String` with no foreign-key relation to
  `User`.** Media therefore may not be reliably discoverable from a user record,
  which affects both erasure and access requests. **[PROPOSAL]** Flag as a
  Decision Log candidate for the `backend-api` agent. Per `CLAUDE.md`, this draft
  does not alter the schema.
- **`Guardian` withdrawal path: now exists** (PR #261) — see R4.
- Children's rights are exercisable by the child, and a guardian's request is not
  automatically the child's request. **[ACTION FOR REVIEW]** Counsel to specify
  who may exercise which right at what age, and how a conflict between child and
  guardian is handled. This draft has no view.

### 2.5 EU GDPR — extension of scope (v0.3)

*Draft for counsel review. Written from the drafter's general knowledge of EU GDPR, not from retrieved
sources (§0 item 5). The Soccernity-specific facts are read from the code; the legal propositions must be
verified.*

#### 2.5.1 Does Soccernity need an Article 27 EU representative?

**Facts.** Soccernity has no establishment in the Union (per the founder's instruction for this pass).
`CLAUDE.md` records the Phase 1 launch markets as Nigeria and England; the UK is outside the EU. Nothing in
the product distinguishes EU users, and (§1.6) there is no means of excluding them.

**Reasoning offered for challenge.**

- A controller with no EU establishment is within EU GDPR only through **Article 3(2)**: offering goods or
  services to data subjects in the Union, or monitoring their behaviour there. Mere accessibility of a
  website from the EU is generally not enough; the test is whether the controller *envisages* serving people
  in the Union (language, currency, EU-directed marketing, references to EU users). On the facts that existed
  before 2026-09-21 — English-language, Nigeria/England launch markets, no EU marketing — Article 3(2)(a) was
  arguably **not** engaged, and no representative was arguably required. This DPIA does not assume that
  reading still holds.
- **The founder's decision to extend the framework to EU GDPR is itself the kind of fact that bears on
  targeting.** If it means Soccernity *intends* to serve EU users — as opposed to merely assessing the
  regime in case some arrive — Article 3(2)(a) is much more likely to apply, and with it Article 27. If it
  means only "design to EU standards," the two are not the same thing, and the distinction is worth writing
  down. **[ACTION FOR REVIEW]** Counsel to determine which it is, because it decides whether an
  Article 27 representative is needed.
- **If Article 3(2) applies, the Article 27(2) exemption is unlikely to be available.** It is limited to
  processing that is occasional, does not involve large-scale special-category data, and is unlikely to
  result in a risk to individuals. A platform built around children's data, public profiles and private
  messaging is a poor fit for "unlikely to result in a risk." The drafter would not rely on the exemption.
- **Consequences of a missing representative** include regulatory exposure independent of any data
  incident, the representative's identity being required in the privacy notice (Article 13(1)(a)), and — a
  practical point — the absence of a lead authority: with no EU main establishment the one-stop-shop
  mechanism is unavailable, so supervisory authorities in each member state where users are can act.
- **Related, not asked, but material: the same question arises for the UK.** The v0.1/v0.2 baseline is UK
  GDPR, and England is a stated launch market. UK GDPR has its own Article 27 (UK representative) for
  controllers with no UK establishment who target UK users. Whether Soccernity has a UK or Nigerian
  establishment is not recorded anywhere this pass could read. **[ACTION FOR REVIEW — new]** Counsel to
  confirm establishment and representative position for the UK as well as the EU. (Nigeria's NDPA 2023 has
  its own registration and data-protection-officer-type obligations, not assessed here.)

**Draft view (not a determination):** an EU representative is **likely to be required from the point
Soccernity intentionally serves EU users**, and is not clearly required if EU users are merely
incidental. The product currently cannot make that distinction operational. A representative would act as
a contact point only — it does not take on Soccernity's liability or replace the need for compliance.

#### 2.5.2 Article 8 and the member-state digital-consent age

Article 8 applies **where consent is the lawful basis** for an information-society service offered directly
to a child. Where the child is below the national digital-consent age, processing is lawful only if
consent is given or authorised by the holder of parental responsibility, and the controller must make
"reasonable efforts to verify" that (Article 8(2)), "taking into consideration available technology."
Member states may set the age anywhere from 13 to 16; the default is 16.

**Member-state variation — recollected, not verified.** As best the drafter recalls (and *this table must
be checked against current national law before use*), the ages fall broadly as follows:

| Digital-consent age | Member states (recollection) |
|---|---|
| 16 | Germany, Netherlands, Ireland, Hungary, Croatia, Luxembourg, Romania, Slovakia, Slovenia, Poland (and others taking the default) |
| 15 | France, Czechia, Greece |
| 14 | Italy, Spain, Austria, Bulgaria, Cyprus, Lithuania |
| 13 | Denmark, Sweden, Finland, Belgium, Portugal, Latvia, Estonia, Malta |

For context, the UK's own age under the Data Protection Act 2018 is **13**.

**Soccernity's thresholds against that range — written confirmation, with its limits.**

- **The guardian-consent threshold is 18** (`computeIsMinor`: `age < 18`, `age.util.ts`; Decision Log #8,
  #10) — **above the highest national floor (16) in every member state.** Confirmed by reading the code: a
  single number, applied regardless of country, so no EU user can fall in a band where Soccernity requires
  *less* than the member state does.
- **The under-16 tier** (`computeIsUnder16`: `age < 16`; Decision Log #346) is **equal to the highest
  member-state floor (16) and above all the others.** It is a *product restriction* layered on top of the
  guardian threshold, not a consent-age mechanism, so it does not by itself satisfy Article 8 anywhere.
- **Neither number falls below any member state's floor.** On that narrow question — *is any Soccernity
  threshold lower than a national digital-consent age?* — the answer is no, in every member state, on the
  drafter's recollection of the table above. **This is not the same as "Article 8 is satisfied,"** for the
  reasons below.

**What that confirmation does not cover (flagged, not resolved):**

1. **Article 8 requires *verified* parental authorisation, not just a threshold above the floor.** The
   verification mechanism is the same weak point analysed for COPPA in §2.6.3, and the same conclusion
   applies: nothing verifies that the person clicking the link is a parent. EDPB guidance is generally read
   as expecting verification proportionate to risk; a public-facing social platform for children sits at the
   higher end. **[ACTION FOR REVIEW]**
2. **Article 8 is engaged only if consent is the basis, and §2.1 has not chosen a basis.** If core service
   processing rests on *contract*, Article 8 is not the operative rule, but many member states restrict the
   contractual capacity of minors, and those rules vary and were not assessed. The guardian-consent flow
   would then be doing work under national contract law, not Article 8. Counsel to decide.
3. **Being *above* the floor is a policy choice with a cost, not a legal ceiling.** A 16- or 17-year-old in
   a member state whose age is 16 can lawfully consent for themselves under Article 8, yet Soccernity treats
   them as a minor requiring a guardian. GDPR does not forbid the stricter rule, but it should be a
   deliberate choice (Decision Log #8) rather than an artefact; R14's age-out sweep is what releases them
   at 18.
4. **Everything keys off self-declared date of birth (R1)** and there is no country awareness — acceptable
   for a single-threshold design, but it means Soccernity cannot apply a *more lenient* rule anywhere,
   and cannot evidence which member state's law applied to a given user.
5. **There is no backend age floor.** The below-5 block (Decision Log #19) is enforced only in the web age
   gate (`AgeGateStep.tsx`, `MINIMUM_SIGNUP_AGE = 5`); `isPlausibleDateOfBirth` in `age.util.ts` accepts
   any non-future date up to 120 years back, and the API accepts any of them. A direct API call can register
   a very young child. Relevant here and to COPPA (§2.6). **[ACTION FOR REVIEW]** Decision Log candidate.
6. **Other EU obligations not assessed:** Article 12 child-appropriate transparency, Article 37 DPO
   appointment (already noted as unassessed in §6), and the Digital Services Act's minor-protection duties
   for online platforms.

*Draft severity (R15): moderate-to-high if EU users are intentionally served; low if genuinely incidental.
Placeholder rating for counsel.*

### 2.6 US COPPA — extension of scope (v0.3)

*Draft for counsel review. COPPA is 15 U.S.C. §§ 6501–6506; the operative rules are the FTC's COPPA Rule,
16 C.F.R. Part 312. The legal propositions below are the drafter's general knowledge, not retrieved
(§0 item 5) — in particular the **2025 amendments to the Rule** (published 2025, with a compliance
deadline in 2026), whose exact content and dates counsel must confirm. The findings about Soccernity's
consent mechanism are from the code and are the part this section can vouch for.*

#### 2.6.1 Does COPPA apply?

COPPA covers operators of commercial websites and online services that are **directed to children under
13**, or that have **actual knowledge** that they are collecting personal information from a child under
13. It reaches foreign operators to the extent they collect personal information from children in the
US. Soccernity is not obviously "directed to" under-13s in the FTC's multi-factor sense, but it
**collects a full date of birth at signup** and accepts registrants from age 5 (`MINIMUM_SIGNUP_AGE`,
web-only — see §2.5.2 item 5). A registrant whose declared age is under 13 is, on any reasonable reading,
a child of whom Soccernity has **actual knowledge.** COPPA's territorial hook is US-resident children;
Soccernity cannot currently tell where a user is (§1.6). The realistic position is therefore: **if any
US under-13 registers, COPPA applies to Soccernity as to that child**, and Soccernity cannot show it has
prevented that. The founder's decision to extend the framework to COPPA is consistent with that reading.

"Personal information" under the Rule is broad and includes a screen or user name, persistent identifiers,
photos, video and audio containing a child's image or voice, and (per the 2025 amendments, as the drafter
understands them) biometric identifiers. `displayName`, `Post.mediaUrls`, `MediaAsset` and `Message.mediaUrl`
all qualify. Geolocation sufficient to identify a street or town also qualifies: whether `Fixture.venue`
plus `GrassrootsTeam.city` reaches that is a question for counsel (see R7).

**COPPA bites on the 5–12 band only.** Soccernity's guardian-consent flow covers ages 5–17 with one
mechanism, so COPPA's stricter verification standard is relevant to the subset — declared age under 13 —
of the population that single flow handles.

#### 2.6.2 What COPPA's "verifiable parental consent" standard requires

The operator must obtain verifiable parental consent **before** collecting personal information from a
child. The standard is *reasonable efforts, taking into account available technology, to ensure that the
person providing consent is the child's parent* — a method "reasonably calculated" to do that. The Rule
lists methods deemed sufficient. As the drafter recalls them, they include: a signed consent form
returned by post, fax or electronic scan; a **monetary transaction** using a credit/debit card or online
payment system that notifies the account holder of each transaction; a **toll-free call** to trained
personnel; a **video conference**; and a **check of government-issued ID** against a database (the ID
deleted promptly). The FTC has also recognised knowledge-based authentication and photo-ID face-matching,
and the 2025 amendments, as the drafter understands them, added further options. **[ACTION FOR REVIEW]**
Counsel to confirm the current list.

**"Email plus."** For operators that use children's personal information **only internally** and do **not
"disclose"** it, the Rule has long allowed a lighter method: an email to the parent **plus an additional
confirming step** — a follow-up call or letter, or a *delayed confirmatory email* — designed to give the
operator reasonable assurance that the consenter is a parent. **The two conditions that matter here are
(i) no disclosure and (ii) a second, independent confirming step.** In the Rule, "disclosure" is broad: it
includes making a child's personal information publicly available by any means, expressly including
through a public posting, a screen name, a chat room or message board. A platform whose purpose is public
profiles, posts, comments and rankings discloses children's information to other users **by design.**

Other COPPA duties bear on the consent flow: a **direct notice** to the parent with prescribed content
(what is collected, that consent is wanted, how to give it, a link to the online notice, and that
information will be deleted if there is no response); a **parent's right to review** the child's information
and to **refuse further collection or use**; **separate consent to disclosure to third parties** where not
integral to the service (an amendment the drafter understands is in the 2025 changes); data retention
limits; and a written information-security programme. Each is assessed against the code in §2.6.4.

#### 2.6.3 Does Soccernity's current mechanism meet that standard? — read from the code

**Short answer, stated before the detail: very likely not, for under-13s, on this product.** The
mechanism is an emailed link that the guardian clicks. Read from the code:

**What the mechanism actually is.**
`RegistrationService.register` (`registration.service.ts`) creates the `User` and, if `isMinor`, a
`Guardian` row from the guardian `name`, `email` and `relationship` **typed in by the child**, with
`consentToken = randomUUID()` and `consentTokenExpiresAt` = now + 72 hours (`consent-token.constants.ts`),
and emails the token as a link. `GuardianConsentService.confirmConsent` (`POST /auth/guardian-consent`)
takes **only the token** and, if it exists, has not expired and is `pending`, sets `consentStatus =
'confirmed'` and records `consentTimestamp`, `consentScreenVersion` and `consentDeviceType`. The
`consentMethod` column defaults to the literal `"guardian-consent-link"`. There is no guard on the route:
the token *is* the credential. Decline (`POST /auth/guardian-consent/decline`) and withdrawal (a fresh
emailed single-use token) work the same way (R4). The web screen adds a checkbox and a button
(`GuardianConsentConfirmPage.tsx`); the checkbox is client-side only and the backend never sees it.

**Findings — each a reason the method is unlikely to be "reasonably calculated" to identify a parent:**

1. **The guardian's contact details are supplied by the child, unverified — and nothing prevents the child
   supplying their own.** `GuardianDetailsDto` validates only that `email` is an email address. **There is no
   comparison of the guardian's email to the registrant's own email anywhere in `registration.service.ts`
   or any DTO** (confirmed by search; `Guardian.email` has no uniqueness constraint either). R1's residual
   row in §4 already said additional friction was "not specified anywhere yet"; this is now confirmed as an
   absence in the code. A child can approve their own account with a second address in seconds.
2. **The single step proves inbox access, nothing more.** Clicking a link establishes that someone with
   access to that mailbox clicked it. It does not establish that the person is a parent, an adult, or even
   a different person from the child. The Rule's methods each add something outside the mailbox — a
   payment instrument, a government ID, a signed document, a live human interaction. This mechanism adds
   nothing outside the mailbox.
3. **There is no second, independent confirming step.** Even measured against the lighter "email plus"
   bar, the flow is a single click: no delayed confirmatory email, no call, no letter. The automatic
   re-send (R4) re-issues the same kind of link; it is not a confirming step.
4. **"Email plus" is unavailable anyway, because Soccernity discloses children's information.** Public
   profiles, posts and comments, the follower graph, and a leaderboard showing real display names of minors
   (Decision Log #45) are all disclosure in the Rule's sense (Banter Rooms and direct messaging are off for
   under-16s under R13, but the public surfaces are not). Since the lighter method is confined to
   internal-use-only operators, the only route open to Soccernity is one of the stronger methods.
5. **The bearer token is a long-lived credential in a possibly shared inbox.** Valid for 72 hours
   (re-clickable within the window for a confirmed row); guardian mailboxes are commonly shared. R5 covers
   this; it compounds finding 2.
6. **Consent is a single bundled yes/no.** There is no separate consent to disclosure of the child's
   information to other users or to third parties, and the screen lists what the account can do as one
   package. If the separate-consent-for-disclosure requirement applies as the drafter understands it, the
   flow cannot express it.

**What the mechanism does well (credit where due, not a finding of adequacy):** it fails closed (a minor
cannot use the product until a guardian confirms — restricted-pending); the token is server-side, unguessable
and expiring; refusal and silence both lead to deletion rather than continued access (R4); and consent
evidence is timestamped and versioned (R6).

**Verdict.** Findings 1–4 together mean the method is **very likely not** COPPA-grade verifiable parental
consent for a child under 13 on this platform. This **confirms the earlier project analysis** that
email-link consent was very plausibly insufficient, and adds two points that analysis did not have in code
form: the absence of *any* guardian/child email check (finding 1), and that the "email plus" fallback is
closed off by disclosure (finding 4). This is the drafter's reading, not a legal determination. **[ACTION
FOR REVIEW]** Counsel to confirm.

**What this means for scoping (options for counsel and the founder, none recommended here):**

- **(A) Build a stronger method for under-13s** — one of the Rule's recognised methods (a payment-instrument
  transaction, ID or KBA check, signed form, live call/video). A new backend flow with cost and friction;
  what a COPPA-grade consent mechanism would be scoped from.
- **(B) Remove disclosure for under-13s and use email-plus with a delayed confirming step.** Requires
  that an under-13 have **no** public profile, posts, comments, public rank or public follower graph — a
  material product change to core features — and even then adds a second confirming step the code does not
  have. Not obviously compatible with the product's purpose.
- **(C) Do not accept under-13s** (raise the floor from 5 to 13 for accounts, or exclude US under-13s).
  Changes Decision Log #19 and the product's grassroots-youth positioning (Log Book Section 10) and needs a
  technical way to enforce it, which does not exist (no backend floor, no country awareness).
- **(D) Do nothing** on the basis that Soccernity does not serve US children. Only defensible if Soccernity
  can show it does not, and it currently has no means to.

#### 2.6.4 Other COPPA gaps visible in the code (secondary to §2.6.3)

- **Direct notice content.** The consent email is sent from a `guardian-consent` template; its body copy was
  not read in this pass and earlier project records describe email bodies as functional placeholders, not
  counsel-reviewed. Whether it carries the prescribed direct-notice content is unverified. The web
  confirmation screen shows what the account can do and what is switched off, which helps, but the notice
  the Rule requires goes to the parent before consent. **[ACTION FOR REVIEW]**
- **Parental right to review.** A guardian can decline or withdraw (which closes the account and starts
  deletion). There is **no route by which a guardian can review what has been collected about the child**
  or refuse further collection while keeping the account. Not built.
- **Separate consent to third-party disclosure.** Not modelled (finding 6).
- **Retention and security.** Retention is designed (R6, §2.4), but whether it satisfies COPPA's
  "no longer than reasonably necessary" and the written-retention and written-security-programme
  requirements is unassessed; hosting and processors are not yet live (R11, R12).
- **No under-13-specific control.** Under-13s go through the same 5–17 flow; the only additional
  restrictions are the under-16 tier's feature limits (R13).

*Draft severity (R16): very high if US under-13s can register, which nothing prevents. Draft likelihood:
high — a self-declared date of birth below 13 is enough to create actual knowledge. Placeholder ratings for
counsel.*

---

## 3. Risks identified — specifically for minors

*Draft for counsel review. This list is a first pass and is very unlikely to be
exhaustive. Likelihood and severity ratings are the drafting agent's rough
placeholders offered as a starting point for challenge — they carry no
methodological weight and should be re-scored by counsel.*

Numbering is stable so mitigations in Section 4 can reference it.

### R1 — Age-gate circumvention (self-declared age)

A child enters a false date of birth and is processed as an adult, bypassing the
consent flow, the restricted-pending state, and every minor-specific protection
that follows. Alternatively, a child enters a true date of birth and then supplies
**their own** email address as the guardian's, self-approving consent.

*Draft severity: high. Draft likelihood: high — this is the normal, expected
behaviour of a determined child user, not an edge case.* Self-declaration is the
weakest link in the entire design, and **[ACTION FOR REVIEW]** counsel should
treat it as the central question of this DPIA rather than one risk among many.

### R2 — Adult-to-minor contact through messaging

`Conversation` and `Message` permit direct private messaging. *v0.1 stated that nothing in the
data model restricts who may message whom; that is no longer true.* The data model itself is
unchanged — `Conversation.participantIds` is still a `String[]` with **no foreign-key relation
to `User`**, so nothing is enforced *by the database* — but the application now enforces the
following, read directly from `modules/messaging/messaging.service.ts` (`startConversation`,
`assertRecipientMessageable`) and the `Under16RestrictionGuard` (PRs #272, #273, #276, #280;
Decision Log #346, #347, #350):

**Controls in place (code merged; not deployed or tested in a live environment):**

1. **An adult cannot start a new conversation with a minor.** If the caller's stored
   `isMinor` is false, the recipient's `isMinor` is true, and no thread between the two already
   exists, the request is refused. Only *creation* is blocked: a thread the minor started is
   returned as-is and the adult may reply inside it. Minor → adult, minor → minor and adult →
   adult are unaffected by this rule.
2. **Under-16 accounts are outside direct messaging altogether.** The whole `/conversations`
   controller is guarded by `Under16RestrictionGuard` (an under-16 caller is refused every
   route), and `assertRecipientMessageable` refuses to let *anyone* start a conversation with an
   under-16 recipient. See R13.
3. **Restricted-pending minors are closed in both directions.** They cannot send (the
   `GuardianConsentGuard` gates `POST /conversations` and `POST …/messages`) and cannot be a
   recipient (a minor without `consentStatus === 'confirmed'` is treated as not messageable).
4. **Server-side authority.** `isMinor`, `isUnder16` and consent status are read from Postgres on
   every request; the JWT carries only `{ sub, role }`. A flag change (including the age sweep,
   R14) therefore takes effect on the next request, even on a live session.
5. **Deactivated / pending-deletion recipients cannot be messaged** (Decision Log #221).

**Enumeration-safety property.** The refusal in (1) does not reveal that the recipient is a
minor. A missing user, a deactivated / pending-deletion user, a restricted-pending minor, and a
confirmed minor approached by an adult all return the **same** HTTP 404 with the same body
(`User not found`). Since PR #280 they also incur the **same database work** — exactly one
`user.findMany` (caller and recipient together, guardian consent status joined in) and one
`conversation.findUnique`, in that order, with every decision then made in memory — so response
time does not structurally distinguish them either. A unit test
(`messaging.service.spec.ts`) asserts identical read counts and byte-identical read arguments
across those four outcomes, so a regression that re-adds an early return fails a test.

**Residual gaps — stated so the risk is not read as closed:**

- **(a) Timing jitter is not eliminated (Decision Log #350).** PR #280 removes the *structural*
  difference in work; ordinary database and network latency variance remains. No fixed-latency
  padding was added — a deliberate founder decision, on the reasoning that extracting a signal
  from jitter needs high-volume repeated probing of one target and a permanent latency floor for
  every legitimate user is not worth it. **[OPEN for counsel]** Revisit only if counsel or a
  compliance requirement calls for constant-time guarantees.
- **(b) The under-16 recipient refusal is NOT enumeration-safe.** It is a distinct
  `403 under_16_restricted` ("This user cannot receive direct messages."), not the 404 above,
  because counsel asked for a clear error. It therefore confirms to *any* caller — adult or not —
  that the account exists, and, by inference from the distinct error, that it belongs to an
  under-16. The parity test in (above) covers only the four 404 outcomes. Disclosed in Decision
  Log #346 and `messaging/README.md`; **[ACTION FOR REVIEW]** counsel to weigh this against the
  clarity benefit. (Note: whether this makes the under-16 tier *more* discoverable to an adult is
  not something this draft can assess.)
- **(c) Everything keys off self-declared date of birth (R1).** An adult who declares a minor's
  date of birth is treated as a minor and can start conversations with other minors; a child who
  declares an adult date of birth is treated as an adult and is blocked from being approached by
  adults — but is also not protected as a minor anywhere else. The rule reduces the *honest*
  adult-initiates-contact path; it does nothing about a deliberately false declaration.
- **(d) Age-flag lag.** `isMinor` is recomputed by a daily job (R14), so a user who turns 18
  keeps `isMinor = true` for up to ~24 hours and, in that window, is still treated as a minor —
  including as someone who may start conversations with other minors. Bounded and small, but
  real.
- **(e) The rule is scoped to conversation creation.** Once a minor has started a thread, this
  pass identified no rate limit, no message-content control and no safeguarding flag inside it.
  Nor did it assess whether adults can otherwise contact minors through comments, follows, Banter
  Rooms or Community Groups (see R3) — no equivalent structural block was looked for or found in
  this pass.
- **(f) `participantIds` still has no foreign key**, and the two-party constraint is enforced in
  the application (`participantKey`, a sorted-and-joined unique key, makes find-or-create
  race-safe), not by the schema.

*Draft severity: very high — unchanged; the controls reduce the likelihood of the direct
adult-initiated path but do not reduce the severity of a contact that gets through. Draft
likelihood: lowered from "moderate, rising with scale" for that specific path, with the
residual dominated by (c). Both ratings are placeholders for counsel to re-score.*

### R3 — Public exposure of a minor's identity and content

Posts, comments, banter rooms, follower graph, club affiliation, and leaderboard
rank are visible to other users. A child's display name, photograph, club, and
approximate location (via club or grassroots team `city`) can be combined by an
observer into a profile useful for targeting.

*Draft severity: high. Draft likelihood: high — this is the product working as
designed, which is what makes it a design question rather than a bug.*

### R4 — Consent withdrawal (mechanism now built; adequacy not assessed)

*v0.1 recorded this as a certain, structural gap: `consentStatus` had only `pending | confirmed`
and there was no route for a guardian to change their mind. That is no longer accurate.* PR
#261 (Decision Log #34, #337–#340; `modules/auth/guardian-consent/*`) added, all keyed to the
existing token-as-credential trust model (the guardian holds no Soccernity account):

- `POST /auth/guardian-consent/decline` — a guardian refuses a pending request.
- `POST /auth/guardian-consent/withdraw/request` then `…/withdraw` — a guardian withdraws
  previously-given consent. The request takes the **minor's** email and issues a fresh,
  single-use `withdrawalToken` to the **guardian's** address (so inbox possession is re-proven
  at withdrawal time rather than inherited from an old email).
- An expiry sweep (`GuardianConsentExpirySweepService`, hourly): when a consent token lapses
  unanswered it is re-sent **once** automatically (and the minor is warned); if that also lapses,
  the request is treated as an **implicit decline**. On the default 72-hour TTL that is roughly
  six days end to end.
- `consentStatus` gained `declined`, CHECK-constrained in Postgres; `consentDeclineSource`
  (`guardian_explicit | guardian_withdrawal | expiry_timeout`) records which route was taken.

All three routes converge on one function, and **the consequence of any refusal is that the
minor's account moves to `pending_deletion` and follows the 30-day anonymization path (R6)** —
not back to restricted-pending, which is what v0.1 proposed. `confirm` cannot reverse a decline.
Non-minors are skipped by the expiry sweep and all refusal paths (so an adult can never be
auto-declined into deletion by a request lapsed while they were a child).

**Still open for counsel:** (i) whether *withdrawal ⇒ account deletion* is the right outcome, or
whether a withdrawal should return the child to restricted-pending; (ii) whether treating
**silence as a decline** after two lapses is appropriate, given that guardian email accounts are
shared and unattended; (iii) whether the withdrawal route is "as easy as giving" consent (it is
two emailed steps against one); (iv) that the request endpoint takes only the minor's email, so
anyone who knows a minor's address can cause a withdrawal email to be sent to their guardian
(rate-limited, but unauthenticated); (v) an active decline and a silent timeout are
distinguishable **only while the `Guardian` row exists** — `ConsentAuditRecord` does not snapshot
`consentDeclineSource` (see R6); (vi) the adequacy of any of this depends on Decision Log #4.

*Draft severity: high. Draft likelihood: no longer "certain" — the structural gap is closed in
code; the residual is the adequacy questions above. Placeholder ratings for counsel.*

### R5 — Consent token weaknesses

*v0.1 recorded that `Guardian.consentToken` had no expiry field and no single-use marker;
`Guardian.consentTokenExpiresAt` now exists (PR #42) and the expiry sweep acts on it (R4). The
original concern is retained below as the reason the control exists.* A token that never
expires is a permanent credential granting the power to activate a child's account, sitting in
an email inbox indefinitely. Guardian email accounts are commonly shared within families.

*Draft severity: high. Draft likelihood: moderate.* **[PROPOSAL]** A token
lifetime of **72 hours**, single-use, invalidated on use, with a re-send path —
offered purely as a starting number for counsel and engineering to accept or
replace. It is **not** a decision and has no security analysis behind it.

### R6 — Consent evidence: what is recorded, and how long it is kept

*v0.1 framed this as an absent audit trail. Both the recording and the retention now exist and
are described here as specific, intentional design choices for counsel to bless or challenge —
not as open questions.* Read from `schema.prisma`, `guardian-consent.service.ts`
(`confirmConsent`), `device-type.util.ts` and `account-deletion-sweep.service.ts`
(`anonymizeUser`, `purgeExpiredConsentAuditRecords`) (PR #274, Decision Log #42, #341, #348).

**(a) IP address is a deliberate, permanent omission.** Consent evidence records the moment
(`consentTimestamp`), the version of the confirmation screen the guardian saw
(`consentScreenVersion`, a **manually bumped** constant — `CONSENT_SCREEN_VERSION`, guarded by a
test that hashes the screen's wording and fails when the wording changes without a version bump)
and a coarse **device type** (`mobile | desktop | unknown`, derived from the User-Agent at the
moment of confirmation). The raw User-Agent is never stored, logged by this code or returned, and
**no IP address is captured**. This is a data-minimisation decision — a guardian's IP is
additional personal data about the guardian, and the evidential set was deliberately kept to the
smallest useful one. It is **not a gap to be closed**, and this draft does not propose adding it.
(This also resolves v0.1's "tension" note: the balance has been struck on the minimal side.)

**(b) The `Guardian` row is hard-deleted at anonymization time**, immediately after being
snapshotted. In one transaction (`anonymizeUser`) the sweep reads `consentStatus`,
`consentTimestamp`, `consentScreenVersion` and `consentDeviceType`, writes them to a
`ConsentAuditRecord`, and then **deletes the `Guardian` row** — taking the guardian's **name,
email and stated relationship** with it. None of those three fields is copied into the
`ConsentAuditRecord`. (Until that moment the `Guardian` row, and so the guardian's name and
email, exists for the life of the account plus the 30-day grace period — and for as long as an
open moderation investigation holds the anonymization, which has no maximum duration.)

**(c) `ConsentAuditRecord` is hard-deleted on a fixed 6-month clock**
(`purgeExpiredConsentAuditRecords`, a daily job, `CONSENT_AUDIT_RETENTION_MONTHS = 6`, applied
with `setUTCMonth` so the cutoff does not drift across daylight-saving changes). The clock runs
from the record's own `createdAt` — the moment of anonymization — and is independent of the
`User` row, which persists in anonymized form with no purge timer (Decision Log #344). Nothing
extends it: not a hold, not an investigation, not a dispute.

**The resulting retention schedule** — proposed as the design, for counsel to confirm, shorten,
lengthen or reject:

| Stage | What exists | For how long |
|---|---|---|
| Live account | `Guardian` row: guardian name, email, relationship, consent status, timestamp, screen version, device type, decline source, tokens | Life of the account |
| `pending_deletion` grace | Same, unchanged | 30 days (longer if an open `Report` holds the account) |
| After anonymization | `ConsentAuditRecord`: consent status, confirmed-at, method, screen version, device type — **no guardian identity** | **6 months**, then hard-deleted |
| After that | **No consent evidence of any kind survives** (the anonymized `User` row remains but holds no consent data) | — |

**What counsel is asked to consider about this schedule** (framed as challenges to a choice,
not gaps): whether six months post-anonymization is a defensible window in which to be able to
"demonstrate consent" (UK GDPR Art. 7(1)) for a departed child, given limitation periods that
counsel may consider longer; whether an evidential record with **no guardian identity** can in
fact demonstrate *that a particular guardian* consented (it evidences *that* a consent event of a
given version occurred, on a given class of device, at a given time — not by whom); whether the
retention clock should be shorter or event-triggered rather than fixed; and the interaction with
R4 — `consentDeclineSource` is **not** snapshotted, so the distinction between an active decline,
a withdrawal and a silent timeout is lost when the `Guardian` row is deleted (open question, part
of Decision Log #338). Also for counsel: `ConsentAuditRecord.minorUserId` is a plain string kept
after the user is anonymized, so within its six months it remains linkable to the (anonymized)
account.

**Known discrepancy in the sibling document, to be reconciled before both go to counsel:**
`docs/legal-copy-draft-tos-privacy-policy.md` (v0.3, Privacy Policy retention table) describes
the snapshot as including the guardian's **relationship**. The code does **not** snapshot
`relationship` (see the `create` call in `anonymizeUser`). One of the two documents is wrong; the
code is authoritative unless the design is meant to change.

*Draft severity: moderate. Draft likelihood: moderate. Placeholder ratings for counsel to
re-score.*

### R7 — Location-and-time exposure via grassroots fixtures

`Fixture` combines `venue` with `scheduledAt` for teams that may be composed of
children. Published fixtures effectively announce where identifiable children will
physically be, at a known time. This is a physical-safety risk distinct from
privacy risk, and it is not mitigated by anything that protects data
confidentiality.

*Draft severity: high. Draft likelihood: moderate.* **[PROPOSAL]** Counsel and
product to consider whether youth-team fixture venues should be visible only to
authenticated team members rather than publicly.

### R8 — Third parties, especially children, in uploaded media

`Post.mediaUrls`, `MediaAsset`, and `Message.mediaUrl` permit image and video
upload. Grassroots football photography routinely captures children who are not
users and have given no consent. The uploader is frequently an adult with no
relationship to the child.

*Draft severity: high. Draft likelihood: high.*

### R9 — Moderation and report handling exposing minors

`Report.reason` is free text and will attract disclosures about children,
potentially including allegations of harm. Moderation queues are viewed by
`AdminUser` accounts (`editor | moderator | superadmin`). No field records whether
a report concerns a minor, and there is no vetting or access-restriction mechanism
in the model for staff who view children's data.

*Draft severity: high. Draft likelihood: moderate.* **[ACTION FOR REVIEW]**
Counsel to advise on DBS checking or equivalent for staff with moderation access,
and on escalation duties where a report discloses a risk of harm to a child. A
platform receiving a report that a child is being harmed may have duties that go
well beyond data protection. This draft is not competent to advise on those and
does not attempt to.

### R10 — Breach impact concentrated on children

A breach of `User` exposes full date of birth, email, phone, display name, and
`isMinor` — a flag that **identifies which records belong to children**, making
child records trivially filterable by an attacker.

*Draft severity: very high. Draft likelihood: low, but non-zero.* **[ACTION FOR
REVIEW]** Counsel to consider encryption-at-rest requirements and whether breach
notification to guardians (not only to affected users) is required. Note that
`isMinor` is a required safeguarding field under `CLAUDE.md` non-negotiable #1 —
this risk is a reason to protect the field, **never** a reason to remove it.

### R11 — Sub-processor and hosting exposure (cannot be assessed yet)

Email provider, media storage, hosting, and error monitoring are all unselected
(Decision Log #9 open; `.env.example` placeholders throughout). Guardian consent
emails containing a child's display name and an activation token will pass through
a third party.

*Draft severity: unknown. Draft likelihood: unknown.* **This risk is recorded as
explicitly un-assessed rather than assessed as low.** It cannot be closed until
the underlying decisions are closed.

### R12 — Controls merged but not yet operating or verified live

*Reworded in v0.2. v0.1 recorded that Sprint D and Sprint 0 had not started, no guardian-consent
screens existed, and `AuthModule` was commented out. None of that is true now: the age gate,
registration, guardian consent (confirm / resend / decline / withdraw / expiry), the
restricted-pending guards, the under-16 tier, the adult-to-minor DM rule, account anonymization
and the age sweep are all merged code.* The risk survives in a narrower form, and is easy to
lose: **"merged" is not "operating".** No live deployment is recorded in the repository;
`CLAUDE.md` records hosting as chosen (Decision Log #26) but live deployment as unverified, and
the email provider (Postmark) and error monitoring (Sentry) as wired but not live. Every
"Built today? Yes" in Section 4 therefore means *the code is merged and covered by automated
tests*, not that the control has run against real users, a real mail provider, or production
data. Several mitigations also depend on **scheduled jobs running correctly in production** —
the guardian-consent expiry sweep, the 30-day anonymization sweep, the consent-record purge and
the age sweep — and none of those can be shown to run until there is a deployment to run them.

*Draft severity: high, if this document is ever mistaken for a description of a live system.*
**[ACTION FOR REVIEW]** This DPIA must be revisited and re-signed once the controls are
deployed and verified. Definition of Done (Build Plan Section 7) treats DPIA review as a hard
blocker on MVP v1 completion.

### R13 — Under-16 tier: what it restricts, and what it leaves open

*New in v0.2. The under-16 tier did not exist when v0.1 was drafted (PR #272, Decision Log
#346, following counsel's Terms/Privacy review).* It is a **second, narrower tier layered on top
of** `isMinor` and `GuardianConsentGuard`, never a replacement: an under-16 with fully
confirmed guardian consent is **still** restricted here. Read from `age.util.ts`,
`under-16-restriction.guard.ts`, the messaging / banter / community-groups controllers, and
`users.service.ts`.

**What it does (code merged; not tested live):**

- `User.isUnder16` is computed from the declared date of birth at registration (age < 16) and
  backfilled for existing rows by the migration. `Under16RestrictionGuard` reads it fresh from
  Postgres on every request (never from the JWT) and returns `403` with a distinct code,
  `under_16_restricted`, that is separate from `guardian_consent_pending`, so a client can tell
  "waiting on your guardian" from "not available at your age". The guard **fails closed** on a
  wiring mistake (throws if a route uses it without a feature tag).
- **Direct messaging:** the whole `/conversations` controller is off for an under-16 (reads
  included), and an under-16 cannot be the recipient of a new conversation from anyone (R2).
- **Banter Rooms:** the whole `/banter-rooms` controller is off for an under-16, reads included.
- **Community Groups:** read-only for an under-16 — `POST /community-groups` (creation) is
  blocked; browsing, joining and leaving stay open. (No group post or comment endpoint exists
  to restrict.)
- **Guardian contact:** `GET`/`PATCH /users/:id` (self-only) returns, for an under-16 only, a
  `guardianContact: { label: 'Guardian contact', email }` field — the *guardian's* address, not
  the child's. No list, roster or feed shape selects `Guardian`.

**Risks and open questions for counsel:**

- **The tier rests on the self-declared date of birth (R1).** A child who declares 16+ is not
  in the tier; nothing in this pass verifies age.
- **The under-16 refusal on being messaged is not enumeration-safe** (R2(b)).
- **Guardian contact discloses a third party's personal data to the child.** The guardian's
  email is shown on the child's own profile. Decision Log #346 records that the counsel
  requirement ("anyone can reach the guardian") was implemented as own-profile exposure only;
  whether a wider exposure was intended is **[OPEN]**. Anyone with access to the child's session
  sees the guardian's address.
- **What the tier does *not* restrict was not enumerated in this pass.** An under-16 can still
  post, comment, follow and be followed, and join clubs and groups as far as this pass could
  tell; whether those need equivalent treatment is the R3 question.
- **The 16–17 tier is a separate, later piece of work and is not built.** Until it is, the
  16–17 band's only protections are `isMinor` gating and the adult-to-minor DM rule (R2).
- **Frontend handling.** Decision Log #346 records that the web client did not yet handle the
  `under_16_restricted` code when the tier shipped; this pass did **not** re-verify that. The
  failure mode is a refused request (safe), not an exposure.
- **Age-out** was a gap disclosed in #346 (a stored flag never recomputed); it is now handled by
  the sweep in R14, with the lag described there.

*Draft severity: high. Draft likelihood: moderate. Placeholder ratings for counsel.*

### R14 — Age reclassification sweep

*New in v0.2 (PRs #275, #279, #281, #282; Decision Log #349).* `isMinor` and `isUnder16` were
originally set once at registration and never recomputed, so a user who turned 16 or 18 stayed
restricted (or gated) indefinitely. A daily job now recomputes both flags from the stored date of
birth (`AgeReclassificationSweepService`, 02:00 daily, using the same `age.util` functions as
registration) and applies changes **in both directions**. Read from
`age-reclassification-sweep.service.ts`.

**What it processes:** the full `dateOfBirth` of every account whose stored flags might disagree
with it (accounts with no date of birth — anonymized rows — are never touched); it writes one
append-only `AgeReclassificationLog` row per flag changed, in the **same transaction** as the
`User` update; and it sends two notifications *after* that transaction commits, best-effort, each
in its own try/catch so a failure can never roll back or block a reclassification:

- **At 18** (`isMinor` true → false): an informational email to the guardian on file
  (`sendGuardianMinorTurned18Email`), asking nothing of them. No guardian row → nothing sent.
- **At 16** (`isUnder16` true → false): an in-app `age_milestone` notification to the user.
- **Younger direction** (false → true, i.e. a corrected date of birth rather than a birthday):
  no notification; logged at `warn` level and returned in a separate list for manual
  investigation.

**Because every consumer reads the flags fresh from Postgres per request, a reclassification
takes effect on the user's very next request, including on an already-issued session** — proven
in the module's e2e test using the same pre-sweep token.

**Turning 18 does not delete the `Guardian` row or give it a new status.** A `confirmed` row is
kept as consent history and simply stops being read for gating; a `pending` row is left inert,
and the expiry sweep and every refusal path now skip non-minors, so an adult cannot be
auto-declined into deletion by a request that lapsed while they were a child. On later
anonymization the row is snapshotted like any other (R6).

**Risks and open questions for counsel:**

- **Up to ~24 hours of lag** in both directions (daily cadence). At 16/18 the lag errs on the
  side of more restriction, except that a newly-18 user is still treated as a minor for up to a
  day, including for the adult-to-minor DM rule in R2(d).
- **A third party is told about an adult's account.** The turning-18 email goes to the
  guardian's address after the data subject has become an adult. Whether the adult's own
  interests, and their privacy notice, cover that disclosure is for counsel. The email body is
  founder-approved copy, **not counsel-reviewed**.
- **The guardian's name, email and relationship are retained for the life of an adult's
  account** (the `Guardian` row is not deleted at 18). This is a deliberate evidence-preserving
  choice with a real data-minimisation cost — a third party's data held for a purpose that no
  longer has an active use. **[ACTION FOR REVIEW]**
- **`AgeReclassificationLog` has no retention period.** It stores no date of birth (only a
  derived integer age at the time of change) and `userId` is a plain string with no foreign key,
  so it survives account anonymization. Decision Log #349 does not set a purge rule. **[OPEN]**
- **A user reclassified younger may be stranded.** Such a user becomes `isMinor = true` with
  possibly no `Guardian` row and no consent request issued (nothing in the sweep creates one).
  `GuardianConsentGuard` fails closed for a minor without a `confirmed` guardian, so the effect is
  a restricted account rather than an exposure — but this pass found no route by which it could be
  released. Reachable only via a date-of-birth correction outside the user-facing API (the update
  DTO does not accept a date of birth).
- **Notification is best-effort.** A failed guardian email is logged, not retried.
- **The 16–17 tier, if built, will depend on this sweep** for correct age-out.

*Draft severity: moderate. Draft likelihood: moderate. Placeholder ratings for counsel.*

### R15 — EU GDPR: establishment, representative, and Article 8 verification

*New in v0.3; see §2.5.* Soccernity has no EU establishment. If it intentionally serves EU users, Article
3(2) is likely engaged and an Article 27 representative is likely required; the founder's 2026-09-21 scope
decision bears directly on whether that is the case. Separately, although both of Soccernity's age
thresholds (18 guardian-consent; 16 under-16 tier) sit at or above the highest member-state
digital-consent age (16), Article 8 also requires *reasonable, technology-appropriate verification* of
parental authorisation, which the current mechanism does not provide (R16 finding 2), and is engaged only
if consent is the chosen lawful basis, which §2.1 has not settled. There is no country awareness in the
product to apply or evidence any member state's rule.

*Draft severity: moderate-to-high if EU users are intentionally served. Draft likelihood: moderate.
Placeholder ratings for counsel.*

### R16 — COPPA: consent mechanism unlikely to be verifiable parental consent for under-13s

*New in v0.3; see §2.6, especially §2.6.3.* A child under 13 can register (nothing enforces an age floor in
the backend; the web floor is 5), supply their own second email address as the "guardian" (no check exists),
and self-approve by clicking a link. Soccernity has actual knowledge of the child's age. The mechanism adds
nothing outside the mailbox to identify a parent, has no confirming second step, and the lighter "email
plus" method is unavailable because the platform discloses children's information by design. Bundled
single-yes consent and the absence of a guardian data-review route are secondary gaps. **Consequence: if US
under-13s are in scope, this DPIA cannot describe R1's residual risk as anything other than unmitigated for
that band without a stronger consent method or a scope change.**

*Draft severity: very high. Draft likelihood: high. Placeholder ratings for counsel.*

---

## 4. Mitigations, cross-referenced to product controls

*Draft for counsel review. Each mitigation names the specific product control it
relies on, and states honestly whether that control **exists today**, so that
counsel is never misled into treating a planned control as an operating one. No
entry below should be read as a claim that the mitigation is adequate.*

| Risk | Proposed mitigation | Product control it relies on | Built today? |
|---|---|---|---|
| **R1** Age-gate circumvention | Age-gate as screen 1 of the six-screen flow; `User.dateOfBirth` and `User.isMinor` captured at registration; account cannot leave restricted-pending without guardian confirmation | Build Plan **Section 8.3** guardian-consent flow, screens 1–2; `CLAUDE.md` non-negotiable #1 (`is_minor`, `guardian_id`, `consent_status`) | **Code merged** (age gate, registration, consent flow, guards) — not verified live (R12) |
| **R1** (residual) | Guardian email must differ from the child's registered email; **[PROPOSAL]** additional friction beyond self-declaration | Not specified anywhere yet — **[ACTION FOR REVIEW]** counsel to advise what verification standard the chosen jurisdiction requires, which depends on Decision Log #4. **v0.3, confirmed in code:** there is no check that the guardian's email differs from the child's, and no second confirming step (§2.6.3). Scope is now UK + NDPA + EU GDPR + COPPA, and COPPA sets a specific standard this does not meet | **No** |
| **R1, R2, R3** | **Server-side authority rule: `is_minor` and `consent_status` are re-read from the database on every request and are NEVER trusted from a JWT claim.** A JWT is issued once and is stale by definition — a token minted before consent was withdrawn or before a moderation action would otherwise still assert the old state, and a token is client-held and therefore attacker-influenced. This is the load-bearing technical control behind every minor-specific restriction in the product | `GuardianConsentGuard` and `Under16RestrictionGuard` read `isMinor` / `isUnder16` / consent status from Postgres per request; the JWT carries only `{ sub, role }`. Covered by guard unit tests and an e2e test that reuses a pre-sweep token after a reclassification. **[ACTION FOR REVIEW]** confirm this is recorded in acceptance criteria | **Code merged** — not verified live |
| **R2** Adult-to-minor contact | An adult cannot **create** a conversation with a minor (refused with the same 404 as a missing user); under-16s are outside DMs entirely; restricted-pending minors are closed in both directions; equal DB work across the four 404 outcomes. Refused by application code, **not** by the database (`participantIds` is still an unrelated `String[]`) | `MessagingService.startConversation` / `assertRecipientMessageable`; `Under16RestrictionGuard`; `GuardianConsentGuard` (PRs #272 / #273 / #276 / #280; Decision Log #346 / #347 / #350). **Residual, not closed:** timing jitter (#350, accepted); the under-16 recipient 403 confirms account existence; all rules key off self-declared DOB (R1); ≤~24h age-flag lag (R14); rule covers DMs only. See R2 | **Code merged** — mitigation **partial** by design |
| **R3** Public exposure | Restricted-pending state: a minor's profile is not visible outside the guardian relationship until `consentStatus` is `confirmed` (per the `Guardian` model comment in `schema.prisma`) | Build Plan **Section 8.3** screen 5 (restricted-pending) and screen 6 (activation); `Guardian.consentStatus` | **Partially** — the field exists; the enforcing screens and endpoints do not |
| **R3** (residual, post-consent) | **[PROPOSAL]** Default a minor's profile to a more private setting **after** activation, so consent unlocks participation rather than full public exposure. Consent to join is not consent to be visible to everyone | No privacy-settings model exists in the schema. **[ACTION FOR REVIEW]** Decision Log candidate | **No** |
| **R4** Consent withdrawal / decline / silence | Guardian decline; guardian withdrawal via a fresh emailed single-use token; one automatic re-send then implicit decline on second lapse; every refusal moves the account to `pending_deletion` | `POST /auth/guardian-consent/decline`, `…/withdraw/request`, `…/withdraw`; `GuardianConsentExpirySweepService`; `Guardian.consentStatus` CHECK-constrained `pending \| confirmed \| declined` (PR #261; Decision Log #34, #337–#340). **[ACTION FOR REVIEW]** withdrawal ⇒ deletion, silence ⇒ decline, and "as easy as giving" are all counsel questions (R4) | **Code merged** — adequacy not assessed |
| **R5** Token weakness | **[PROPOSAL]** `consentToken` single-use, invalidated on use, expiring after **72 hours** (starting number only), with a guardian-facing re-send path | `Guardian.consentToken` exists and is `@unique`, but has **no expiry or used-flag field**. **[ACTION FOR REVIEW]** Decision Log candidate | **Partially** — expiry (`consentTokenExpiresAt`), the resend path, and the "expired-confirmed-still-rejected" behavior are implemented as proposed (PR #42, `sprint-1/consent-token-expiry`). The 72-hour TTL and whether this mechanism satisfies whatever counsel decides is needed are still **unreviewed** — code existing is not a legal determination that R5 is closed |
| **R6** Consent evidence & retention | Minimal evidential set: timestamp, screen version, coarse device type; **no IP, no raw User-Agent (permanent, deliberate)**; `Guardian` row (name/email/relationship) hard-deleted at anonymization after snapshotting; `ConsentAuditRecord` hard-deleted after a fixed 6 months | `Guardian.consentTimestamp / consentScreenVersion / consentDeviceType`; `ConsentAuditRecord`; `anonymizeUser`; `purgeExpiredConsentAuditRecords` (PR #274; Decision Log #42, #341, #348). Screen-version constant is manually bumped, guarded by a hash test. **[ACTION FOR REVIEW]** counsel to bless or challenge the 6-month window and the absence of guardian identity in the retained record | **Code merged** — retention schedule is a design choice awaiting counsel |
| **R7** Fixture location | **[PROPOSAL]** Restrict venue visibility for youth fixtures to authenticated team members | `Fixture.venue`, `GrassrootsTeam.leagueType` (`informal \| school \| academy`) — `leagueType` may offer a usable signal for youth teams, though it is not an age field. **[ACTION FOR REVIEW]** | **No** |
| **R8** Third parties in media | Reporting and takedown route for anyone depicted, including non-users; **[PROPOSAL]** an explicit, plain-language rule on uploading images of children | `Report` model and the Admin moderation queue (Build Plan **Section 8.4**). **[ACTION FOR REVIEW]** `Report` requires a logged-in `reporterId`, so a non-user parent has **no route to report a photo of their child**. Significant gap | **Partially** |
| **R9** Moderation exposure | **[PROPOSAL]** Restrict child-related reports to specifically designated staff; **[PROPOSAL]** an escalation path for reports disclosing risk of harm | `AdminUser.role` (`editor \| moderator \| superadmin`) gives a role primitive to build on. Build Plan **Section 8.4** moderation/appeals workflow. **[ACTION FOR REVIEW]** Counsel to advise on staff vetting and on any reporting duty to external authorities | **Partially** |
| **R10** Breach impact | **[PROPOSAL]** Encryption at rest; access controls; a breach-response plan naming who notifies guardians | Depends entirely on hosting — **Decision Log #9, still open**. Cannot be specified here | **No** |
| **R11** Sub-processors | Article 28 contracts, transfer assessments, and processor-specific review for email, storage, hosting, and monitoring; **[PROPOSAL]** configure Sentry to scrub request bodies and identifiers before any real DSN is added | `.env.example` placeholders. Sentry is currently inert — `Sentry.init()` is never called without a DSN, per `services/api/src/app.module.ts` | **No** |
| **R12** Controls merged, not verified live | Re-run and re-sign this DPIA once controls are deployed and tested; keep DPIA review as a hard blocker | Definition of Done, Build Plan **Section 7** | N/A — process control |
| **R13** Under-16 tier | Messaging and Banter off entirely; Community Groups creation off; guardian contact shown on own profile; distinct `under_16_restricted` code; guard fails closed if untagged | `User.isUnder16`; `Under16RestrictionGuard` + `@RestrictUnder16(feature)`; `users.service.ts` `guardianContact` (PR #272; Decision Log #346). **Open:** rests on self-declared DOB; 403 not enumeration-safe; guardian email shown to the child; 16–17 tier not built | **Code merged** — partial |
| **R14** Age reclassification | Daily recompute of `isMinor` / `isUnder16`, both directions; append-only `AgeReclassificationLog` written in the same transaction; guardian email at 18, in-app notice at 16; `Guardian` row kept at 18 | `AgeReclassificationSweepService` (PRs #275 / #279 / #281 / #282; Decision Log #349). **Open:** ~24h lag; third-party email about an adult; guardian data retained for an adult's account; log has no retention period; younger-direction users may be stranded | **Code merged** — not verified live |
| **R15** EU GDPR | Decide whether EU users are intentionally served; if so appoint an Article 27 representative and name them in the privacy notice; confirm the lawful basis so it is clear whether Article 8 or national contract-capacity law governs; keep thresholds ≥ 16 | `computeIsMinor` (<18), `computeIsUnder16` (<16) — both ≥ the highest member-state floor. No country field, no geo-control. **Open:** representative not appointed; verification of parental authorisation (R16); no backend age floor | **Partially** — thresholds yes; representative, country awareness, verification no |
| **R16** COPPA VPC | One of: (A) a recognised stronger consent method for under-13s; (B) no disclosure of under-13s' information + email-plus with a delayed confirming step; (C) do not accept under-13s; (D) rely on not serving US children. **None chosen** | Current control is the emailed consent link: `RegistrationService.register`, `GuardianConsentService.confirmConsent`. **No guardian≠child email check; no second step; single bundled consent; no parent data-review route** (§2.6.3, §2.6.4). Not COPPA-grade for under-13s in the drafter's reading | **No** — current mechanism very likely insufficient; stronger method not built |

### 4.1 The safeguarding fields are load-bearing

Recorded here so it survives into any downstream summary. The fields
`is_minor`, `guardian_id`, `consent_status`, `consent_token`, and
`consent_timestamp` on `User` and `Guardian`, and the restricted-pending state
they support, are the mechanism by which **most mitigations above actually
operate**. `CLAUDE.md` non-negotiable #1 forbids removing or weakening them.

From a data protection standpoint that rule is well-founded: removing any one of
them would silently disable a mitigation this DPIA relies on, and would do so
without any visible failure. **[PROPOSAL]** Counsel to consider recording removal
or weakening of these fields as an event that automatically requires this DPIA to
be reassessed before release.

### 4.2 Residual risk

**[NOT ASSESSED — deliberately.]** A residual-risk rating is the output of a
completed DPIA process involving people who understand both the product and the
law. Producing one here from an unreviewed first draft, against controls that do
not yet exist (R12), would create a false impression of assurance. This section is
left for counsel to complete after review.

Counsel should specifically consider whether any residual risk remains **high**
after mitigation, since that would trigger the Article 36 prior-consultation duty
with the ICO. This draft expresses no view on whether it does.

---

## 5. Open items carried forward

Restated in one place so nothing here is mistaken for settled.

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | **Decision Log #4** — jurisdictional scope beyond UK GDPR | **OPEN** — founder decided 2026-09-21 to extend the framework to EU GDPR + COPPA; this DPIA now analyses both (§2.5, §2.6) but does not close the entry. Suggested docx wording (Temi to phrase): *scope extended to EU GDPR + US COPPA per founder decision 2026-09-21; consent-mechanism gap under review; still Open* | Founder + counsel |
| 2 | **Decision Log #8** — regional minimum age for the age-gate | **OPEN** — no number appears in this draft | Founder + counsel |
| 3 | **Decision Log #9** — hosting platform, and therefore data location and transfers | **OPEN** — transfer risk un-assessed | Founder |
| 4 | **Decision Log #7** — auth provider | **OPEN** — affects the JWT/server-side-authority control | Founder |
| 5 | **Decision Log #6** — sports-data vendor | **OPEN** | Founder |
| 6 | Lawful basis for each processing purpose | **NOT DETERMINED** in this draft | Counsel |
| 7 | Whether any Article 9 special-category data is processed | **NOT ASSESSED** | Counsel |
| 8 | Consent withdrawal mechanism (R4) | Mechanism built (PR #261); adequacy questions in R4 open | Counsel |
| 9 | Consent token expiry and single-use (R5) | Implemented as proposed (PR #42) — 72h TTL, single-use, resend path; now also drives the expiry sweep. TTL value and overall approach still need review | Counsel |
| 10 | Reporting route for non-users depicted in media (R8) | Gap flagged, not resolved | Counsel + product |
| 11 | Staff vetting for moderation access (R9) | **NOT ASSESSED** | Counsel |
| 12 | Data subject rights implementation, incl. erasure and `MediaAsset` FK gap | **NOT ASSESSED** | Counsel + `backend-api` |
| 13 | Residual risk rating and any Article 36 prior consultation | **NOT ASSESSED** | Counsel |
| 14 | Reconciliation against the actual text of Build Plan Section 8.1 | Outstanding — source `.docx` unreadable by the drafting agent | Founder |
| 15 | Build Plan / Log Book version drift (v1.1 vs v1.4 vs v1.7) | Outstanding | Founder |
| 16 | Consent-evidence retention schedule (R6): 6 months post-anonymization, no guardian identity retained, IP deliberately never captured | Design choice stated for counsel to bless or challenge — **not** an open question about IP | Counsel |
| 17 | Discrepancy: legal-copy v0.3 Privacy Policy says the consent snapshot includes the guardian's *relationship*; the code does not snapshot it (R6) | Outstanding — reconcile one document or the other | Founder + drafter |
| 18 | Under-16 recipient 403 confirms account existence; timing jitter accepted (Decision Log #350) (R2) | Disclosed, not closed | Counsel |
| 19 | Under-16 tier scope; guardian email shown on the child's own profile; 16–17 tier unbuilt (R13) | Flagged for counsel; nothing decided | Counsel + founder |
| 20 | Age sweep: retention of `AgeReclassificationLog`; guardian data kept past 18; turning-18 email to a guardian about an adult; younger-direction accounts with no consent path (R14) | Flagged for counsel; nothing decided | Counsel |
| 21 | Anonymization design (retaining posts / comments / messages under "[deleted user]"; indefinite hold; no purge of the anonymized row) and Art. 17 sufficiency (§2.4) | **NOT ASSESSED** by counsel | Counsel |
| 22 | **EU Article 27 representative** — is one required (depends on whether EU users are *intentionally* served); same question for a UK representative and Soccernity's UK/Nigeria establishment (§2.5.1) | **NOT DETERMINED** | Counsel + founder |
| 23 | **Article 8 / national contract capacity** — which governs depends on the lawful basis; the member-state age table in §2.5.2 is recollection, unverified | **NOT ASSESSED**; table must be verified | Counsel |
| 24 | **COPPA: guardian-consent mechanism** — very likely not verifiable parental consent for under-13s (§2.6.3); options A/B/C/D unchosen | **OPEN — finding stands pending counsel confirmation.** Drives whether a `backend-api` scoping task for a COPPA-grade flow is needed | Counsel + founder |
| 25 | **No check that guardian email ≠ child's email; no second confirming step** (§2.6.3 findings 1, 3) | Confirmed absence in code; nothing decided | Counsel + `backend-api` |
| 26 | **No backend age floor** — below-5 block is web-only; API accepts any past date of birth (§2.5.2 item 5) | Gap flagged; Decision Log candidate | `backend-api` + founder |
| 27 | **COPPA secondary gaps** — direct-notice content of the consent email unverified; no parent data-review route; no separate consent to third-party disclosure (§2.6.4) | **NOT ASSESSED / not built** | Counsel + `backend-api` |
| 28 | **Legal propositions in §2.5 / §2.6 were written from general knowledge, not retrieved sources** — 2025 COPPA amendments and member-state ages must be verified (§0 item 5) | Outstanding | Counsel |

---

## 6. Sign-off

*This DPIA is not in force. It has no status until every line below is completed
by a qualified person. An incomplete sign-off block means the document remains a
draft, regardless of how finished the rest of it looks.*

**Scope note (v0.3, 2026-09-21):** the scope this DPIA is to be signed against has been **expanded** by
founder decision from UK GDPR + Nigeria NDPA 2023 to also include **EU GDPR** and **US COPPA**. Counsel is asked to sign
(or decline to sign) against that wider scope. Adding two regimes increases, not reduces, what must be
reviewed. **Reviewed by counsel: NOT YET.** Nothing in v0.3 is approved.

**Confirmation required at sign-off:**

- [ ] The structure has been reconciled against MVP Build Plan Section 8.1 as actually written
- [ ] Decision Log #4 (jurisdictional scope) is closed, and this DPIA reflects the closed decision (v0.3 extends scope to EU GDPR + COPPA; entry still open)
- [ ] §2.5 (EU GDPR) and §2.6 (COPPA) have been verified against primary sources — the drafter retrieved none — and the Article 27 and COPPA consent-mechanism findings (R15, R16) have been decided
- [ ] Decision Log #8 (minimum age) is closed, and this DPIA reflects the closed decision
- [ ] A lawful basis has been determined for each processing purpose
- [ ] Every **[PROPOSAL]** above has been accepted, revised, or rejected — none left undecided
- [ ] Every **[ACTION FOR REVIEW]** has been addressed
- [ ] Residual risk has been assessed and any Article 36 prior consultation considered
- [ ] The controls in Section 4 marked "Built today? No" are either built and verified, or the DPIA is explicitly signed as a design-stage assessment requiring re-signature before launch

---

**Data Protection / Safeguarding Counsel**

Name: ______________________________________________

Position / Qualification: ______________________________________________

Organisation: ______________________________________________

Signature: ______________________________________________

Date: ______________________________________________

Approved / Approved with amendments / Not approved (delete as applicable): ______________________________________________

---

**Founder / Data Controller representative**

Name: ______________________________________________

Signature: ______________________________________________

Date: ______________________________________________

---

**DPO (if appointed — appointment requirement not assessed in this draft):**

Name: ______________________________________________

Signature: ______________________________________________

Date: ______________________________________________

---

## Closing statement

*v0.3 (2026-09-21) note: this revision extends the assessed scope to EU GDPR and US COPPA and surfaces two new risks (R15, R16); it does not complete, advance or approve the DPIA, and its legal propositions were not verified against primary sources. The Section 6 sign-off block remains empty; "Reviewed by counsel: NOT YET."*

*v0.2 (2026-09-20) note: this revision corrects factual statements against the merged code and
adds R13 and R14; it does not complete, advance or approve the DPIA. The Section 6 sign-off
block is unchanged and empty.*

**This document is a draft for counsel review and nothing more.** It is not a
completed DPIA, it is not legal advice, it does not assert that Soccernity is
compliant with any legal regime, and it does not close any Decision Log item. It
was produced by an automated agent working from a partial view of the project's
documentation — the two authoritative source documents could not be read directly
(Section 0).

Per `CLAUDE.md` non-negotiable #2, no output of the `safeguarding-drafter` agent
may be treated as approved. If anyone proposes shipping the guardian-consent flow,
the age-gate, or any minor-facing feature on the strength of this document alone,
or asks to skip counsel review to move faster: the answer is no. This is the one
area of the project where a shortcut carries real legal and child-safety
consequences, and the cost of being wrong is borne by children who did not choose
to take the risk.
