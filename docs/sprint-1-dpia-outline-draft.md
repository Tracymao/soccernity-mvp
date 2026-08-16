# Soccernity — Data Protection Impact Assessment (DPIA)

## FIRST-PASS DRAFT — NOT APPROVED, NOT LEGAL ADVICE, NOT A COMPLETED DPIA

**Status: draft for counsel review.**

This document is a first-pass draft produced by the `safeguarding-drafter` agent
(see `CLAUDE.md`, non-negotiable #2). It has **not** been reviewed by Soccernity's
safeguarding/legal counsel — a role recorded as a priority hire in Inventor's Log
Book Section 15 and, at the time of writing, unfilled.

Nothing in this document should be read as a statement that Soccernity is
compliant with UK GDPR, the Data Protection Act 2018, the Online Safety Act, the
ICO Age Appropriate Design Code, or any other regime. No section of this draft has
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
- **Sprint / PR:** Sprint 1, PR S1 (independent — does not block or depend on other Sprint 1 PRs)
- **Draft date:** 2026-08-16
- **Drafted by:** `safeguarding-drafter` agent (automated first pass)
- **Reviewed by counsel:** NOT YET — see Section 6
- **Version:** 0.1 (draft)

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
`displayName`, **`dateOfBirth`**, `isMinor`, `role`, `verificationStatus`,
`createdAt`, `clubAffiliationId`.

Note for counsel: `dateOfBirth` is stored in full, not as a derived age band or a
boolean. Full date of birth is a strong identifier and elevates the impact of any
breach. **[PROPOSAL]** Counsel to consider whether the age-gate's operational
needs can be met by storing a derived age band plus a hash or truncated value,
retaining full DOB only where a specific purpose requires it. This draft does not
propose a schema change — under `CLAUDE.md`, altering the data model is a Decision
Log matter (Build Plan Section 9), not a change to make in a policy document.

**Guardian consent — `Guardian`:** `minorUserId`, guardian `name`, guardian
`email`, `relationship` to the child, `consentStatus` (`pending` | `confirmed`),
`consentToken`, `consentTimestamp`.

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
- **Auth provider is not yet decided** — Decision Log #7, still open. `AuthModule`
  is commented out in `services/api/src/app.module.ts`; the guardian-consent
  endpoints do not exist yet.
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

**[OPEN DECISION — Decision Log #4] Jurisdictional scope beyond UK GDPR.**
Whether Soccernity's data protection framework extends beyond UK GDPR — to EU
GDPR, to COPPA (US), or to other regimes — is recorded as an open item in Build
Plan Section 9 and has **not** been closed. This draft is written against UK GDPR
concepts **as a working assumption only, because a first pass has to start
somewhere**, and that assumption is not a finding. It is not a recommendation that
UK-only is the right scope. Consequences counsel should note:

- If EU users are in scope, Article 8 GDPR sets a digital-consent age that member
  states may set anywhere between 13 and 16, and it varies by state. A single
  hardcoded age would be wrong somewhere.
- If US users are in scope, COPPA applies below 13 with a materially different and
  more prescriptive verifiable-parental-consent standard than "email to a
  guardian." The consent flow described in Build Plan Section 8.3 may not meet it.
- If scope is genuinely UK-only, that requires a technical and contractual means
  of limiting the user base, which does not currently exist in the product.
- The Online Safety Act and the ICO's Age Appropriate Design Code may impose
  duties independently of which consent regime applies. **[ACTION FOR REVIEW]**
  This draft does not assess either and is not competent to.

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

- **No soft-delete or `deletedAt` field on any entity.** How erasure is
  implemented — hard delete, anonymisation, or tombstoning — is unspecified, and
  is complicated by content that references other users (`Follow`, `Comment`,
  `Message`, `Report`).
- **`MediaAsset.uploaderId` is a plain `String` with no foreign-key relation to
  `User`.** Media therefore may not be reliably discoverable from a user record,
  which affects both erasure and access requests. **[PROPOSAL]** Flag as a
  Decision Log candidate for the `backend-api` agent. Per `CLAUDE.md`, this draft
  does not alter the schema.
- **No `Guardian` → withdrawal path.** See R4.
- Children's rights are exercisable by the child, and a guardian's request is not
  automatically the child's request. **[ACTION FOR REVIEW]** Counsel to specify
  who may exercise which right at what age, and how a conflict between child and
  guardian is handled. This draft has no view.

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

`Conversation` and `Message` permit direct private messaging. Nothing in the data
model restricts who may message whom. `Conversation.participantIds` is a
`String[]` with **no foreign-key relation to `User`**, which makes any
participant-based rule harder to enforce at the database level. Unrestricted
adult-stranger-to-child private messaging is the highest-severity risk pattern on
any social platform.

*Draft severity: very high. Draft likelihood: moderate, and rising with scale.*

### R3 — Public exposure of a minor's identity and content

Posts, comments, banter rooms, follower graph, club affiliation, and leaderboard
rank are visible to other users. A child's display name, photograph, club, and
approximate location (via club or grassroots team `city`) can be combined by an
observer into a profile useful for targeting.

*Draft severity: high. Draft likelihood: high — this is the product working as
designed, which is what makes it a design question rather than a bug.*

### R4 — Consent cannot be withdrawn

**[SIGNIFICANT GAP]** `Guardian.consentStatus` is documented in `schema.prisma`
as `pending | confirmed`. **There is no `withdrawn` or `revoked` state, and no
endpoint or screen in Build Plan Section 8.3's six-screen flow for a guardian to
change their mind.** Under UK GDPR, where consent is relied upon it must be as
easy to withdraw as to give. A guardian who consents and later wants their child
off the platform currently has no in-product route.

*Draft severity: high. Draft likelihood: certain — this is a present structural
gap, not a contingent risk.* **[PROPOSAL]** Raise as a Decision Log candidate:
does the flow need a seventh screen (guardian withdrawal), and does `consentStatus`
need a third state? This draft flags it and does not decide it — it is both a
schema change and a legal determination.

### R5 — Consent token weaknesses

`Guardian.consentToken` is a unique string with **no expiry field and no
single-use marker** in the schema. A token that never expires is a permanent
credential granting the power to activate a child's account, sitting in an email
inbox indefinitely. Guardian email accounts are commonly shared within families.

*Draft severity: high. Draft likelihood: moderate.* **[PROPOSAL]** A token
lifetime of **72 hours**, single-use, invalidated on use, with a re-send path —
offered purely as a starting number for counsel and engineering to accept or
replace. It is **not** a decision and has no security analysis behind it.

### R6 — Incomplete or absent consent audit trail

`consentTimestamp` records *when*, but nothing records *how* — no IP address, no
user agent, no record of the consent wording version shown. If consent is
challenged later, Soccernity may be unable to demonstrate it, and Article 7(1)
places that burden on the controller.

*Draft severity: moderate-to-high. Draft likelihood: moderate.* **[PROPOSAL]**
Counsel to specify the minimum evidential record. Note the tension: a fuller audit
trail is itself additional personal data about the guardian, so this is a
balance for counsel to strike, not an obvious "collect more" answer.

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

### R12 — Design-stage risk: controls specified but not yet built

Recorded as a risk in its own right because it is easy to lose. As of this draft,
`CLAUDE.md` records that **Sprint D and Sprint 0 have not started**, no
guardian-consent screens exist in Figma, and `AuthModule` is commented out in
`services/api/src/app.module.ts`. Section 4's mitigations are therefore
overwhelmingly *planned*, not *operating*.

*Draft severity: high, if this document is ever mistaken for a description of a
live system.* **[ACTION FOR REVIEW]** This DPIA must be revisited and re-signed
once the controls are actually built and tested. A DPIA signed against planned
controls is a design-stage document, and the Definition of Done (Build Plan
Section 7) treats DPIA review as a hard blocker on MVP v1 completion.

---

## 4. Mitigations, cross-referenced to product controls

*Draft for counsel review. Each mitigation names the specific product control it
relies on, and states honestly whether that control **exists today**, so that
counsel is never misled into treating a planned control as an operating one. No
entry below should be read as a claim that the mitigation is adequate.*

| Risk | Proposed mitigation | Product control it relies on | Built today? |
|---|---|---|---|
| **R1** Age-gate circumvention | Age-gate as screen 1 of the six-screen flow; `User.dateOfBirth` and `User.isMinor` captured at registration; account cannot leave restricted-pending without guardian confirmation | Build Plan **Section 8.3** guardian-consent flow, screens 1–2; `CLAUDE.md` non-negotiable #1 (`is_minor`, `guardian_id`, `consent_status`) | **No** — no screens exist; `AuthModule` commented out |
| **R1** (residual) | Guardian email must differ from the child's registered email; **[PROPOSAL]** additional friction beyond self-declaration | Not specified anywhere yet — **[ACTION FOR REVIEW]** counsel to advise what verification standard the chosen jurisdiction requires, which depends on Decision Log #4 | **No** |
| **R1, R2, R3** | **Server-side authority rule: `is_minor` and `consent_status` are re-read from the database on every request and are NEVER trusted from a JWT claim.** A JWT is issued once and is stale by definition — a token minted before consent was withdrawn or before a moderation action would otherwise still assert the old state, and a token is client-held and therefore attacker-influenced. This is the load-bearing technical control behind every minor-specific restriction in the product | Recorded as a binding rule in this draft for the `backend-api` agent; supports `CLAUDE.md` non-negotiable #1 and Build Plan Section 8.3. **[ACTION FOR REVIEW]** Confirm this rule is written into the Auth module's acceptance criteria before Sprint 1 Auth work begins, and covered by a specific test | **No** — Auth not built |
| **R2** Adult-to-minor contact | **[PROPOSAL]** Restrict who may initiate a conversation with a minor account | `Conversation` / `Message` models exist, but **contain no such restriction**, and `participantIds` is an unrelated `String[]`, making DB-level enforcement harder. **[ACTION FOR REVIEW]** Decision Log candidate — this may need a data-model change, which this draft does not make | **No** |
| **R3** Public exposure | Restricted-pending state: a minor's profile is not visible outside the guardian relationship until `consentStatus` is `confirmed` (per the `Guardian` model comment in `schema.prisma`) | Build Plan **Section 8.3** screen 5 (restricted-pending) and screen 6 (activation); `Guardian.consentStatus` | **Partially** — the field exists; the enforcing screens and endpoints do not |
| **R3** (residual, post-consent) | **[PROPOSAL]** Default a minor's profile to a more private setting **after** activation, so consent unlocks participation rather than full public exposure. Consent to join is not consent to be visible to everyone | No privacy-settings model exists in the schema. **[ACTION FOR REVIEW]** Decision Log candidate | **No** |
| **R4** Consent withdrawal | **[PROPOSAL]** Add a `withdrawn`/`revoked` state to `Guardian.consentStatus` and a guardian-initiated withdrawal path; on withdrawal, the account returns to restricted-pending | `Guardian.consentStatus` currently supports only `pending \| confirmed`. **[ACTION FOR REVIEW]** Both a schema decision and a legal determination — flagged, not decided | **No** |
| **R5** Token weakness | **[PROPOSAL]** `consentToken` single-use, invalidated on use, expiring after **72 hours** (starting number only), with a guardian-facing re-send path | `Guardian.consentToken` exists and is `@unique`, but has **no expiry or used-flag field**. **[ACTION FOR REVIEW]** Decision Log candidate | **No** |
| **R6** Audit trail | **[PROPOSAL]** Record consent method and the version of the consent wording shown alongside `consentTimestamp` | `Guardian.consentTimestamp` exists. Counsel to specify the minimum evidential set, balancing evidential value against collecting more data about the guardian | **Partially** |
| **R7** Fixture location | **[PROPOSAL]** Restrict venue visibility for youth fixtures to authenticated team members | `Fixture.venue`, `GrassrootsTeam.leagueType` (`informal \| school \| academy`) — `leagueType` may offer a usable signal for youth teams, though it is not an age field. **[ACTION FOR REVIEW]** | **No** |
| **R8** Third parties in media | Reporting and takedown route for anyone depicted, including non-users; **[PROPOSAL]** an explicit, plain-language rule on uploading images of children | `Report` model and the Admin moderation queue (Build Plan **Section 8.4**). **[ACTION FOR REVIEW]** `Report` requires a logged-in `reporterId`, so a non-user parent has **no route to report a photo of their child**. Significant gap | **Partially** |
| **R9** Moderation exposure | **[PROPOSAL]** Restrict child-related reports to specifically designated staff; **[PROPOSAL]** an escalation path for reports disclosing risk of harm | `AdminUser.role` (`editor \| moderator \| superadmin`) gives a role primitive to build on. Build Plan **Section 8.4** moderation/appeals workflow. **[ACTION FOR REVIEW]** Counsel to advise on staff vetting and on any reporting duty to external authorities | **Partially** |
| **R10** Breach impact | **[PROPOSAL]** Encryption at rest; access controls; a breach-response plan naming who notifies guardians | Depends entirely on hosting — **Decision Log #9, still open**. Cannot be specified here | **No** |
| **R11** Sub-processors | Article 28 contracts, transfer assessments, and processor-specific review for email, storage, hosting, and monitoring; **[PROPOSAL]** configure Sentry to scrub request bodies and identifiers before any real DSN is added | `.env.example` placeholders. Sentry is currently inert — `Sentry.init()` is never called without a DSN, per `services/api/src/app.module.ts` | **No** |
| **R12** Controls not yet built | Re-run and re-sign this DPIA once controls are built and tested; keep DPIA review as a hard blocker | Definition of Done, Build Plan **Section 7** | N/A — process control |

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
| 1 | **Decision Log #4** — jurisdictional scope beyond UK GDPR | **OPEN** — not decided in this draft | Founder + counsel |
| 2 | **Decision Log #8** — regional minimum age for the age-gate | **OPEN** — no number appears in this draft | Founder + counsel |
| 3 | **Decision Log #9** — hosting platform, and therefore data location and transfers | **OPEN** — transfer risk un-assessed | Founder |
| 4 | **Decision Log #7** — auth provider | **OPEN** — affects the JWT/server-side-authority control | Founder |
| 5 | **Decision Log #6** — sports-data vendor | **OPEN** | Founder |
| 6 | Lawful basis for each processing purpose | **NOT DETERMINED** in this draft | Counsel |
| 7 | Whether any Article 9 special-category data is processed | **NOT ASSESSED** | Counsel |
| 8 | Consent withdrawal mechanism (R4) | Gap flagged, not resolved | Counsel + `backend-api` |
| 9 | Consent token expiry and single-use (R5) | 72h proposed as a starting number only | Counsel + `backend-api` |
| 10 | Reporting route for non-users depicted in media (R8) | Gap flagged, not resolved | Counsel + product |
| 11 | Staff vetting for moderation access (R9) | **NOT ASSESSED** | Counsel |
| 12 | Data subject rights implementation, incl. erasure and `MediaAsset` FK gap | **NOT ASSESSED** | Counsel + `backend-api` |
| 13 | Residual risk rating and any Article 36 prior consultation | **NOT ASSESSED** | Counsel |
| 14 | Reconciliation against the actual text of Build Plan Section 8.1 | Outstanding — source `.docx` unreadable by the drafting agent | Founder |
| 15 | Build Plan / Log Book version drift (v1.1 vs v1.4 vs v1.7) | Outstanding | Founder |

---

## 6. Sign-off

*This DPIA is not in force. It has no status until every line below is completed
by a qualified person. An incomplete sign-off block means the document remains a
draft, regardless of how finished the rest of it looks.*

**Confirmation required at sign-off:**

- [ ] The structure has been reconciled against MVP Build Plan Section 8.1 as actually written
- [ ] Decision Log #4 (jurisdictional scope) is closed, and this DPIA reflects the closed decision
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
