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
- **Sprint / PR:** Sprint 1, PR S1 (v0.1); factual refresh `docs/dpia-draft-refresh` (v0.2); scope extension `docs/dpia-v0.3-eu-gdpr-coppa` (v0.3); messages and content removal `docs/dpia-refresh-2026-11-10` (v0.4); suspension on a report, vetted-only message context and report retention `legal/dpia-refresh-2026-11-11` (v0.5); report retention restored to 6 to 7 years, who may act on a message report that involves a child, appeals by a suspended person `legal/dpia-incident-retention-restored-2026-11-11` (v0.6); Contact Us appeal category now offered on the web page and in the admin inbox `docs/dpia-contactus-rollforward-2026-11-12` (v0.7)
- **Draft date:** 2026-08-16 (v0.1); revised 2026-09-20 (v0.2); revised 2026-09-21 (v0.3); revised 2026-11-10 (v0.4); revised 2026-11-11 (v0.5); revised 2026-11-11 (v0.6); revised 2026-11-12 (v0.7)
- **Drafted by:** `safeguarding-drafter` agent (automated first pass, v0.1); v0.2 revised with
  Claude Code, from the merged code rather than from summaries; v0.3 to v0.6 likewise
- **Reviewed by counsel:** NOT YET — see Section 6
- **Version:** 0.7 (draft — still NOT APPROVED)

### Changelog — v0.6 → v0.7 (2026-11-12)

**What this update is, stated plainly.** A narrow correction against `origin/main` (`e2eac9a`). v0.6 said the seventh public Contact Us category
"Appeal a suspension" (`suspension_appeal`) existed only in the API. That stopped being true when PR #739 (B-298) put the category in the public
Contact Us form, with its helper line, and in the admin Contact enquiries filter, list and detail labels. Only the sentences that said so are changed
(search for `[CHANGED v0.7`). **No new analysis, no new risk, no risk closed, and nothing here has been seen by counsel.** The sentences changed,
and those checked and left alone, are listed in `docs/dpia-contactus-rollforward-2026-11-12-report.md`.

### Changelog — v0.5 → v0.6 (2026-11-11)

**What this update is, stated plainly.** v0.6 brings R33, R34, R35 and R36 and the matching §1.3, §2.4, §4 and §5 rows into line
with the founder's decisions of 2026-11-11 recorded as Decision Log **#490 to #494** and with what is merged on `origin/main`
(`e6bcf0e`: PRs #730, #731, #732, #735). **It does not itself constitute progress toward sign-off, and it closes no risk.** The
Section 6 sign-off block is unchanged and empty ("Reviewed by counsel: NOT YET"); no lawful basis has been chosen; no residual
risk has been rated; no [PROPOSAL] or [ACTION FOR REVIEW] from an earlier version has been accepted or closed. Every changed
passage carries the marker **[CHANGED v0.6 — 2026-11-11]**. Facts were read from the merged code; **nothing was run against a
live environment** and **no statute, regulator guidance or case law was retrieved** (the §0 item 5 limitation applies in full).

**Who each new question goes to.** Only a real legal question is marked **[ACTION FOR REVIEW]** (for counsel). Product, access and
design questions that need the founder, not a lawyer, are marked **[FOR FOUNDER — not a counsel blocker]** so they are not
mistaken for legal blockers.

Changed:

1. **Report retention restored to counsel's approved range of 6 to 7 years** (Decision Log #490; B-299, PR #735). A closed report is
   now deleted **6 years** after it closes, or **7 years** if it concerns a minor (`REPORT_RETENTION_YEARS`,
   `REPORT_RETENTION_CONCERNS_MINOR_YEARS`; `REPORT_RETENTION_MONTHS` is gone). This **replaces** the 12 months and 6 years of v0.5
   (Decision Log #487, figures only; the rest of #487 stands). The range comes from the legal draft's record of counsel's review
   (`docs/legal-copy-draft-tos-privacy-policy.md`, v0.7 resolved decision 10: "6–7 years for data tied to a concluded
   investigation or moderation case"); this DPIA has not seen counsel's advice itself. **The effect is a longer store:** the typical
   report is kept six times as long as v0.5 said (6 years instead of 12 months), a child-safety report one year longer, and the chosen context messages of a
   child's private chat that hang off a reported message go with them (R33(c), R36(h)). R36(b), (g), (h) and §5 items 39, 42, 43.
2. **Two things no longer stop the sweep** (Decision Log #493; B-299). A hold record that points at a purged report stays and its
   link is cleared; a Contact Us enquiry that was escalated into the report is detached and returns to its ordinary 12-month clock.
   R36(d), R36(i), §5 item 47.
3. **Who may act on a message report that involves a child** (Decision Log #491; B-297, PR #730). Recording an action, recording an
   appeal on someone's behalf and deciding an appeal on a message report now need a child-safety-vetted admin where the reported
   sender or any participant is under 18, in addition to the `concernsMinor` gate. This **narrows** the R33(f)(iii) and R35(c)(vi)
   gap; it does not close it (R33(f) update, §5 item 45).
4. **Appeals by a suspended person** (Decision Log #492; B-292, PR #731; B-298, PR #732). Staff can record an appeal on a suspended
   person's behalf; the recorder, and the admin who took the original action, may not decide it; a seventh public Contact Us
   category "Appeal a suspension" exists in the API. This **answers R35(c)(i) in code**; **[CHANGED v0.7 — 2026-11-12]** it is now also offered on
   the public Contact Us page and in the admin inbox (PR #739; v0.6 said it was not). It also means a Contact Us enquiry may hold a child's account details (R35 update, §5 items 37, 44).
5. **Smaller rulings** (Decision Log #494): no legal-hold check on a suspension is a founder decision, not an open point; the
   reinstatement email says nothing about points; the emails as built are the source of truth (R35(b)(iii)).
6. **Kept open, recorded not decided (register Section 85c):** the suspension email goes to the address on file (R35 update, item
   6); a report that is held or escalated keeps its enquiry until the report is purged (R36(i), item 47).

New risks: none (R35 and R36 revisited; R32 is still held). New §5 items 42 to 47. Items 37, 39, 40 and 36 are reworded in place.

**Still visibly stale, not edited (noticed while reading):** the v0.5 list below ("What is not changed, and is still visibly
stale") is unchanged. New in v0.6: the hold routes (place and lift a legal or bad-faith hold) are gated on `concernsMinor` only, not
on the participants' ages (R33(f) update); this pass did not check whether Decision Log #488 (removed Contest entries) is built, so
the "contest entry" block in R36(d) is stated as it was.

---

### Changelog — v0.4 → v0.5 (2026-11-11)

**What this update is, stated plainly.** v0.5 brings four parts of this DPIA into line with the founder's decisions of
2026-11-11 (Decision Log #485 to #489) and with what is merged on `origin/main` (`0e440bf`), and nothing else. **It does not
itself constitute progress toward sign-off, and it closes no risk.** The Section 6 sign-off block is unchanged and empty
("Reviewed by counsel: NOT YET"); no lawful basis has been chosen; no residual risk has been rated; no [PROPOSAL] or
[ACTION FOR REVIEW] from an earlier version has been accepted or closed. Every changed passage carries the marker
**[CHANGED v0.5 — 2026-11-11]** so counsel can find it. Facts were read from the merged code and from the per-feature
documents named in each passage; **nothing was run against a live environment** and **no statute, regulator guidance or case
law was retrieved** (the §0 item 5 limitation applies in full to everything added).

Changed:

1. **Suspension of an account on a report, and the email to the person** (Decision Log #485; B-291, PR #722). A moderator's
   `user_suspended` now suspends the account behind the target in the same step, and the person is emailed at once. New risk
   **R35** (including the tipping-off question and the wrongful-suspension question). §1.3, new R35, §4, §5.
2. **Message context shown to staff only when no child is involved** (Decision Log #486; B-293, PR #721). This answers the gap
   v0.4 recorded as R33(f). R33(f) is amended and what remains is stated; **the gap is narrowed, not closed**.
3. **Report retention** (Decision Log #487; B-294, PR #725). A closed report is now deleted 12 months after closure (6 years if it
   concerns a minor), with the content it removed. This **supersedes in part** v0.4's repeated statement that reports have no
   retention clock (R33(c), R34(b), §2.4). New risk **R36**. The 6-year figure is unverified for UK law.
4. **Hold rules compared** (Decision Log #482, #484, #487). Messages, a removed post's files and reports each follow a
   different hold rule; restated side by side in R36(e) and in `docs/dpia-addendum-post-media-draft.md` (v0.3).

Also folded in because they touch the same passages: the removed-message stub now carries `isMine` and the two
post-media approval paths no longer publish a removed post's file (B-296, PR #724; Decision Log #489, #484), noted in R34 and in
the addendum.

New risks **R35** and **R36** (**R32 is still held** by the option in `docs/cloudflare-processor-and-cross-border-draft.md`
§8.4). New §5 items 35 to 41.

**What is not changed, and is still visibly stale.** Noticed while reading the code, deliberately not edited: (a) §2.4's
statements that an open `Report` "holds the anonymization indefinitely" and that the anonymised `User` row has "no purge timer"
(they predate Decision Log #375 and #376); (b) R8 and §1.2 still describe `Post.mediaUrls` and `Message.mediaUrl` as the media
path; (c) R9 still says no field records whether a report concerns a minor and that no staff vetting exists (both now exist:
`Report.concernsMinor`, `AdminUser.childSafetyVetted`); (d) R2(e) does not mention that a recipient can report a message;
(e) R34(f) says Contest effects of a removal are undecided; Decision Log #488 decided them (a removed entry leaves the ranking,
its points are revoked, both restored on overturn) and handed the work to a separate session; **this pass did not check whether
that is built**. v0.4's "stale" list (a) to (d) is unchanged by this update.

---

### Changelog — v0.3 → v0.4 (2026-11-10)

**What this update is, stated plainly.** v0.4 brings four parts of this DPIA into line with what the founder has
decided and what is merged on `origin/main` (`29e0966`), and nothing else. **It does not itself constitute progress
toward sign-off.** The Section 6 sign-off block is unchanged and empty ("Reviewed by counsel: NOT YET"); no lawful basis
has been chosen; no residual risk has been rated; no [PROPOSAL] or [ACTION FOR REVIEW] from an earlier version has been
accepted or closed. Every changed passage below carries the marker **[CHANGED v0.4 — 2026-11-10]** so counsel can find
it. Facts were read from the merged code and from the per-feature reports named in each passage; **nothing was run
against a live environment** and **no statute, regulator guidance or case law was retrieved** (the §0 item 5
limitation applies in full to everything added here).

Changed:

1. **Direct messages** (Decision Log #478, B-287; #482). The line that private messages are kept under an anonymous
   label after an account is anonymised (§2.4) is superseded: a daily job deletes each message **12 months after it was
   sent**, except messages kept under a report or an active legal hold. Messages are **not end-to-end encrypted**; this
   is now stated. §1.3, §2.2, §2.4, new **R33**, §4, §5.
2. **Reporter-added context** (Decision Log #477, B-286). When a person reports a message they may attach up to 10
   messages before and 10 after it; staff see them. Who sees them, why, and where the child-safety-vetting gate does and
   does not apply are set out in **R33**.
3. **Soft removal of posts, comments and messages** (Decision Log #483, B-289). A moderator's "Remove Content" hides the
   item from users and keeps the row and its text for staff; what that keeps, and for how long, is set out in new **R34**.
4. **Media of a removed post** (Decision Log #484, B-290): summarised in R34 and set out in full in the new §1.5 and the
   amended R30 of `docs/dpia-addendum-post-media-draft.md` (v0.2).

New risks **R33** and **R34**, numbered after the post-media addendum's R23–R31 (**R32 is held** by the option in
`docs/cloudflare-processor-and-cross-border-draft.md` §8.4). Added §5 items 29–34.

**What is not changed, and is now visibly stale.** Noticed while reading the code, deliberately not edited because this
update was scoped to the four subjects above: (a) §2.4's statement that an open `Report` "holds the anonymization
indefinitely" and §2.4's "no purge timer" for the anonymised `User` row predate Decision Log #375 and #376; (b) R8 and
§1.2 still describe `Post.mediaUrls` and `Message.mediaUrl` as the media path (the free-address path was replaced by the
upload pipeline, and no route writes `Message.mediaUrl`); (c) R9 says no field records whether a report concerns a minor
and that no staff vetting exists, which is no longer true (`Report.concernsMinor`, `AdminUser.childSafetyVetted`); (d) R2(e)
says no rate limit, message-content control or safeguarding flag was found inside a conversation, and does not mention that a recipient can now report a message.
These are listed so counsel does not read the unedited text as current.

---

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

**[CHANGED v0.4 — 2026-11-10]** `Post` and `Comment` each carry `removedByModerationAt` and `removedByReportId` (a moderator's soft removal, R34);
`PostMedia.deletedByModerationAt` records that the stored file of a removed post was deleted (`dpia-addendum-post-media-draft.md`
§1.5). Source: `schema.prisma` (migrations `20261125090000_add_content_removal`,
`20261126090000_add_post_media_deleted_by_moderation`).

**Private communications:** `Conversation` (`participantIds`), `Message`
(`contentText`, `mediaUrl`, `sentAt`, `readAt`).

**[CHANGED v0.4 — 2026-11-10]** The `Message` row now also carries: `editedAt`; **`originalContentText`**, the text as first sent, written once on
the first edit and never overwritten (no user-facing read returns it; staff see it only on a reported message, R33);
`deletedForEveryoneAt`; and `removedByModerationAt` / `removedByReportId` (a moderator's removal, R34). Per-person hiding
is kept in `MessageHide` and `ConversationHide`. `ReportContextMessage` links a report to messages the reporter chose as
context (R33). `Message.mediaUrl` is a leftover column: the send route refuses it and nothing writes it.
**Messages are not end-to-end encrypted.** `contentText` is a plain text column in Postgres; the messaging module has no
encryption code (the application-level encryption this pass found elsewhere is the `DOB_ENCRYPTION_KEY` cipher used for
date of birth and authenticator secrets; this pass did not search the whole codebase for others). Whether the database host also encrypts storage at rest is a provider matter that is
**not verified** (no hosting account exists). Sources: `services/api/prisma/schema.prisma` (`Message`),
`modules/messaging/messaging.service.ts`.

**Behavioural and engagement:** `Notification`, `LeaderboardEntry` (points, rank,
period — a **publicly ranked** record potentially including children).

**Safeguarding and moderation:** `Report` (reporter identity, target type/ID,
free-text `reason`, status). Reports are the highest-sensitivity records in the
system: a report may contain an allegation about a named child, written by a
named child.

**[CHANGED v0.4 — 2026-11-10]** A report can now target a **message** (`targetType: 'message'`). It can then link, through `ReportContextMessage`,
to up to 20 further messages of the same conversation that the reporter chose, so a report about a message can bring the
text of other people's private messages (including other children's) into the staff moderation tool (R33). Source:
`modules/moderation/moderation.service.ts`, `moderation.constants.ts`.

**[CHANGED v0.5 — 2026-11-11]** Two further things now hang off a report. (1) `User.suspendedByReportId` (a nullable link from an account to the **one report
that caused its suspension**; deleted-report rule `ON DELETE SET NULL`; migration `20261127090000_add_user_suspended_by_report`)
joins an account to a specific report, so the account row now carries a pointer into the moderation record (R35). (2) The
report is now deleted by a retention sweep, together with the content it removed (R36). Sources:
`modules/account-suspension/account-suspension.service.ts`, `modules/moderation/report-retention.service.ts`,
`schema.prisma` (`User`, `Report`).

**[CHANGED v0.6 — 2026-11-11]** Three more things hang off a report. (1) `Report.appealRecordedByAdminId` records which admin filed an appeal on a suspended person's behalf (migration
`20261128090000_add_report_appeal_recorded_by`; B-292). (2) A report that is purged no longer takes its `AccountHold` rows or an escalated Contact Us
enquiry with it: the hold row stays with `reportId` cleared, the enquiry is detached (migration `20261129090000_account_hold_report_detachable`; B-299). (3) A
Contact Us enquiry may now carry the category `suspension_appeal` (the person's name, email, subject, message, and the email address on the account that the
helper line asks for; migration `20261128100000_add_contact_suspension_appeal_category`; B-298). R35 update, R36(i).

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
| `Conversation` / `Message` content | Necessary to a messaging feature | **The harder question is not necessity but whether minors should have unrestricted DM access at all — see R2.** **[CHANGED v0.4 — 2026-11-10]** Retention is now 12 months from sending (founder decision, Decision Log #478), with exceptions; the stored original of an edited message and the reporter-chosen context messages are new data; see R33. No counsel position exists on the 12-month figure |
| `Fixture.venue` + `scheduledAt` | Necessary to fixtures | **Proportionality turns on visibility, not collection — see R7** |
| `LeaderboardEntry` (public rank) | Necessary to the feature | **[PROPOSAL]** Public ranking of identifiable minors is a design choice, not a technical necessity — counsel to consider whether minors should be excluded from public boards or shown pseudonymously |
| `Report.reason` (free text) | Necessary to moderation | Free text will attract sensitive disclosures by design; handling needs care. **[CHANGED v0.5 — 2026-11-11]** A closed report is deleted 6 years after closure (7 years if it concerns a minor), inside counsel's approved "6–7 years"; see R36. **[CHANGED v0.6 — 2026-11-11]** (v0.5 said 12 months and 6 years) |
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
  memberships are deleted, and teams they organised become dormant. `Post`, `Comment`
  and `Result` rows are **kept**, now attributed to "[deleted user]"; `Report` rows
  are never touched. **[CHANGED v0.4 — 2026-11-10]** **`Message` rows are no longer kept indefinitely**: a daily job deletes each message 12 months
  after it was sent, whoever sent it and whatever the state of the account (Decision Log #478; R33). Anonymisation itself still
  does not touch messages. An open moderation `Report` involving the account **holds** the
  anonymization indefinitely (no maximum duration; Decision Log #345 adds admin visibility
  only). **[ACTION FOR REVIEW]** Whether retaining a departed user's posts, comments and
  private messages under an anonymous label satisfies Article 17 for that user — particularly
  `Message.contentText` in a thread the *other* participant still holds, and free-text posts
  that may themselves identify the author — is a question for counsel; the design rests on the
  Recital 26 reasoning recorded in the sweep's own header comment, which is an argument, not a
  determination. The anonymized `User` row itself has no purge timer (Decision Log #344).
  **[CHANGED v0.4 — 2026-11-10]** For messages the question above is therefore narrower than v0.3 stated: a departed user's private
  messages stay under the anonymous label for at most 12 months from the day each was sent, **unless** a report targets the
  message, a report attached it as context, or an active legal hold covers its sender or any other participant of its
  conversation, in which case it stays for as long as that report or hold does (R33). No retention clock exists for a
  report, so "as long as the report" is open-ended. A moderator's soft removal does not delete anything (R34).
  **[CHANGED v0.5 — 2026-11-11]** The sentence "No retention clock exists for a report" is **no longer true for a closed report**: a daily sweep now deletes a
  closed report, and the content it removed, 6 years after closure (7 years if the report concerns a minor) **[CHANGED v0.6 — 2026-11-11]**, and a deleted
  report ends the exceptions above. It remains true for a report that is still open or awaiting an appeal, an escalated report, a
  report under an active admin hold, and the four "blocked" cases listed in R36(d). So the departed user's messages stay under the
  anonymous label for as long as the **later** of 12 months from sending and the life of any report that points at them (R36).
  **[CHANGED v0.6 — 2026-11-11]** That life is now up to 6 years after closure, or 7 years if the report concerns a minor (R36(b)), so a departed user's messages that
  a report points at can stay under the anonymous label for years longer than v0.5 said.
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
- **(g)** **[CHANGED v0.4 — 2026-11-10]** Messages are not end-to-end encrypted, are deleted 12 months after sending (with exceptions), and a
  recipient can report a message, which shows it and chosen context to staff. See **R33**. Note that (e) above is now partly
  out of date: a recipient *can* report a message; the content of a thread is still not screened.

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

### R33 — Private messages: readable by the server, kept 12 months, and shown to staff when reported — with chosen surrounding context

**[CHANGED v0.4 — 2026-11-10]** *New in v0.4. Sources: `modules/messaging/message-retention.service.ts`, `messaging.service.ts`;
`modules/moderation/moderation.service.ts`, `moderation.constants.ts`; `schema.prisma` (`Message`, `ReportContextMessage`);
Decision Log #477, #478, #482; build-register B-286, B-287; `docs/backend-message-retention-report.md`,
`docs/backend-message-retention-legal-hold-report.md`, `docs/backend-message-report-context-report.md`.*

**(a) Messages are stored readable and are not end-to-end encrypted.** The server holds the plain text of every message
(§1.3). An edited message also keeps its **original text**, which no user can read. "Delete for me" and "delete for
everyone" hide a message but do not remove the row or the text; only the retention job (b) or a hard delete of the
conversation does. Anyone with database access, or a breach of it (R10), exposes private conversations, including those
between children. Encryption at rest by the host is not verified.

**(b) Retention: 12 months from sending, decided by the founder.** `MessageRetentionService` runs daily at 04:00 and deletes
every message strictly older than `MESSAGE_RETENTION_MONTHS` calendar months (default 12), oldest first, at most 500 per
run, for **minors and adults alike**, together with the stored original of an edited message and messages already
deleted for everyone. A conversation left with no messages is deleted by the same run; per-person hide rows go with the
message. A DM carries no media, so there is no stored file to delete. The 12-month figure is the founder's decision
(Decision Log #478); **it has no counsel position**, and the public legal draft carries 12 months only as a `[PROPOSAL]`
starting figure. **[ACTION FOR REVIEW]** whether 12 months is defensible for children's private messages, and why not
shorter.

**(c) Exceptions — a message is kept past 12 months when:** (i) a `Report` with `targetType: 'message'` points at it;
(ii) a `ReportContextMessage` row attached it to a report as context; or (iii) an **active legal hold** exists for the
message's sender **or for any other participant of its conversation** (`AccountHold.type = 'legal_hold'`, not lifted,
Decision Log #482). Bad-faith holds and holds derived from a report do **not** exempt a message (the report guard already
protects the specific reported message). (The stored files of a removed post are treated differently: **either** kind of
active admin hold keeps them; see `dpia-addendum-post-media-draft.md` §1.5, finding 3.) Nothing is recorded about skipped messages: when the report or hold ends, the
next run deletes whatever is then past 12 months. **Open-ended in practice:** exceptions (i) and (ii) last as long as the
`Report` row exists, and **no retention clock exists for reports** (`backend-message-retention-report.md`, last bullet of
"Other things the reviewer should know"). **[ACTION FOR REVIEW]** counsel to say how long a reported message, and the
context attached to it, may be kept after the report is closed. A report filed in the instant between the job's
two statements cannot save a message the delete has already removed (a single-transaction window).

**[CHANGED v0.5 — 2026-11-11]** **Update to (c): "no retention clock exists for reports" is superseded for closed reports** (Decision Log #487, B-294,
`ReportRetentionService`). A closed report, its context links and (if the message was removed) the removed message are deleted
6 years after closure, or 7 years if the report concerns a minor **[CHANGED v0.6 — 2026-11-11]**; the context messages themselves are **not** deleted by that
sweep and then fall to the normal 12-month message sweep. Exceptions (i) and (ii) therefore now last at most until the report is
deleted, **except** where the report is open or awaiting an appeal, escalated (kept until counsel answers B-206), under an
active admin hold, or blocked (R36(d)). The hold rule for messages is still legal hold only; the rule for reports differs (R36(e)).

**[CHANGED v0.6 — 2026-11-11]** **Update to (c), v0.6: the exceptions now last up to 6 or 7 years.** Because exceptions (i) and (ii) last as long as the report, and a report is now kept
6 years after closure (7 if it concerns a minor), a reported message, and the up to 20 context messages a reporter attached from a child's private chat,
can stay in the database for years after the 12-month message rule would have deleted them. Context messages are protected while the report exists and
fall to the 12-month sweep only after it is deleted. This is the largest increase in how long children's private messages can be kept; it comes from the
reporting design (R33(d)) and the report clock (R36(b)), not from the 12-month message rule, which is unchanged. Mitigations that exist, none new: only
a recipient can report; the reporter picks at most 20 messages in a 10-before, 10-after window, checked on the server; staff-only reading; vetted-only
reading and acting when a child is involved (the (f) update); deletion at the end of the period. Not mitigated: nothing shortens the period for a message
report. **[FOR FOUNDER — not a counsel blocker]** whether a message attached as context should be kept for the full report period.

**(d) Reporter-added context (Decision Log #477, B-286).** A person who reports a message from a conversation they take
part in may attach other messages of **that conversation**: up to 20 in total, each among the 10 messages immediately
before or after the reported one. The server checks every id: same conversation, inside the window (counted over all of the
conversation's messages, so the window reveals nothing about hidden ones), and visible to the reporter exactly as the
reported message must be (not hidden by them, after any "delete chat" cutoff, not deleted for everyone). The reporter's own
messages are allowed; the reported message itself is not a valid context id; one bad id refuses the whole set with the same
404 the other refusals give. Only a recipient can report: the sender of a message, a stranger and a participant of another
conversation all receive that same 404. The public (logged-out) report route never accepts a message target or context.
A repeat report on the same message by the same person while the first is open returns the first and adds any new valid
ids to it, up to the 20.

**(e) Who sees them, and why.** Staff only: the admin report detail (`GET /admin/moderation/reports/:id`, moderator and
superadmin roles) returns the reported message and the context messages, oldest first, each with the sender's **public
name**, the text, the **original text before any edit**, whether it was edited, deleted for everyone or removed, and (for
context) whether the reporter sent it. No conversation id, recipient, sender id or any other message of the thread is
returned. Filing a report notifies nobody (not the reported person, not the other participant). The purpose is to let a
moderator judge a message in context rather than in isolation; whether the context is *necessary* and *proportionate* is the
founder's product decision, and **this draft does not assess it**. **[ACTION FOR REVIEW]** the context a reporter picks will
often contain the **other person's** messages (the person reported) and, in a thread between two children, messages by a
child who never agreed to share them with staff; no notice to the other participants that their messages may be shown to
staff exists in the product, and none is drafted here (the legal draft is not edited by this pass).

**(f) The vetting gate does not follow the children in the thread.** The child-safety-vetting gate
(`AdminUser.childSafetyVetted`, read fresh on every call) applies to a report only when `Report.concernsMinor` is true. For
a message report made through `POST /reports` that flag is set **only** when the reporter chooses the reason category
`child_safety_concern` (Decision Log #466; that route has no minor field of its own). A message report made under any other
category — for example harassment between two 14-year-olds — is therefore readable, with up to 20 context messages and the
original text of edited ones, by **any moderator or superadmin, vetted or not**; editors have no access to the moderation
queue. **[ACTION FOR REVIEW]** whether the gate should key off the ages of the participants rather than the reporter's
category. This pass did not check whether a staff read of a reported message is itself logged.

**[CHANGED v0.5 — 2026-11-11]** **Update to (f): the gap is narrowed for message reports, not closed** (Decision Log #486, B-293, PR #721). For an admin who is
**not** child-safety-vetted (a fresh read of `AdminUser.childSafetyVetted` on each request), the admin report detail now reads
`User.isMinor` for the reported message's sender and for every participant of its conversation. If **any** of them is under 18,
or a participant has no `User` row, or the message row cannot be found (**it fails closed**), the response carries
`contextHidden: true`, `contextMessages: []` (the context query is not run, so not even a count of attached messages leaves the
server) and `reportedMessage.originalContentText: null` (the "edited" marker stays). A vetted admin sees everything, as before.
The decision now follows the **children in the thread**, not the reporter's reason category. Source:
`modules/moderation/moderation.service.ts` (`getReportById`, `threadInvolvesMinor`), `moderation.message-context-vetting.spec.ts`.
**What remains, stated so it is not read as solved:** (i) the **bare reported message** (its text, the sender's public name, the
time, its status) is still visible to any moderator or superadmin, vetted or not, when a child is involved; (ii) "under 18" is the
stored `isMinor` flag, which the daily age job updates, so it can lag a birthday by up to about a day; (iii) the vetting
requirement to **act** on a report is unchanged and still depends on `Report.concernsMinor`, so a non-vetted moderator can
record an action on a message report between two children, including (R35) a suspension, without being able to see the context
that would show what happened; (iv) post, comment and user reports about a child under a category other than
`child_safety_concern` are not gated by the participants' ages (they carry no context messages, but the reported item's text is
shown); (v) only the admin report-detail read was checked in this pass, not every other place staff can see a message.
**[ACTION FOR REVIEW]** whether (i) to (iv) are acceptable.

**[CHANGED v0.6 — 2026-11-11]** **Update to (f), v0.6: acting on a message report now follows the children in the thread** (Decision Log #491, B-297, PR #730;
`moderation.service.ts` `assertVettedToActOn`). Recording an action on a message report, recording an appeal on someone's behalf and deciding an appeal now
need a child-safety-vetted admin when the reported sender or any participant of the conversation is under 18 (the same fail-closed reading as the read
rule: a missing message row or a participant with no user row counts as a child), as well as when `Report.concernsMinor` is true. A vetted admin is never
blocked and the thread is not looked up for them. Other admins can still open the report and see the bare message and "Context hidden: this involves a
child". **This answers (iii) for message reports.** **What remains, read in the code:** (a) a post, comment or user report about a child under a category
other than `child_safety_concern` can still be actioned, including suspended, by a non-vetted moderator; (b) the user-page suspension (`PATCH
/admin/users/:id`) has no vetting call in `admin-users.service.ts` (found by search, not tested); (c) **the hold routes** (place a legal or bad-faith hold, lift a
hold) in `moderation-holds.service.ts` are gated on `concernsMinor` only, so a non-vetted moderator can place or lift a hold on a message report between two
children, and a hold keeps data longer (R36(e)); (d) `escalateReport` requires a vetted admin for every report, so it is unaffected. **[FOR FOUNDER — not a counsel blocker]** whether (a) to (c)
should follow the same rule. Not a legal question; nothing is decided or changed by this draft.

**(g) Right of access.** "Download my data" exports the account holder's **own sent messages** (current text of an edited
message; never the original; not messages deleted for everyone; never other people's messages), so messages received, the
stored originals and the context messages in a report are not in the export (`modules/data-export/data-export-file.builder.ts`).
Whose rights apply to a child's request is still a counsel question (legal draft Part C row 12, not edited).

**(h) What this does not change.** The rules that stop an adult starting a conversation with a minor, the under-16
exclusion and the equal-work 404s (R2) are untouched. An adult cannot start a **new** conversation with a minor, but may
reply in an existing one; once the 12-month job deletes a quiet thread that exemption is gone and the adult cannot start a
new one. A `message` notification for a deleted thread degrades to "no longer available".

*Draft severity: high (the data are children's private conversations and a moderator-visible copy of them). Draft
likelihood: certain (it is how the product is built). Placeholder ratings for counsel.*

### R34 — Soft removal: content a moderator removes is hidden, not erased

**[CHANGED v0.4 — 2026-11-10]** *New in v0.4. Sources: `modules/moderation/content-removal.util.ts`, `moderation.service.ts`; `feed`, `messaging`,
`search`, `notifications`, `post-media` modules; Decision Log #483, #484; build-register B-289, B-290;
`docs/backend-content-removal-report.md`, `docs/backend-removed-post-media-report.md`.*

**(a) What is built.** A moderator's "Remove Content" on a report now acts on the **one reported item** when its target is
a **post, comment or message** (any other target type is refused). It is a **soft** removal: the row, its text, its edit
history and its engagement rows stay in the database; two columns (`removedByModerationAt`, `removedByReportId`) say it is
removed. Users see: a removed **message** as a text-less stub to both people (no text, no sender), in the thread and in the
inbox preview; a removed **comment** as a text-less stub with no author, not counted; a removed **post** disappears from
feeds, search, saved items, notifications' data and counts, a direct link answers as a missing post, and **only its author**
sees a "removed" stub. The sender of a removed message can no longer edit or delete it. Staff reads still return the full
item. Context messages attached to a message report are **never** removed; only the reported item is.
**[CHANGED v0.5 — 2026-11-11]** The removed-message stub now carries `isMine` (true when the viewer sent it) so a client can place it on the right side; it
still carries no sender id (Decision Log #489, B-296, PR #724).

**(b) Removed is not deleted, and no retention clock applies.** The text of a removed post, comment or message stays for as
long as the row does. Posts and comments follow the account rules (kept under "[deleted user]" after anonymisation).
A removed **message** is the target of a report, so the 12-month job keeps it (R33(c)) for as long as the report exists, and
reports have no retention clock. **[ACTION FOR REVIEW]** whether removed content should have a deletion clock once the appeal
window has closed; whether keeping the text of a removed item indefinitely meets data minimisation and storage limitation;
how this interacts with Article 17 for the author.

**[CHANGED v0.5 — 2026-11-11]** **Update to (b): a clock now exists, through the report.** The report sweep (R36) hard-deletes the content a closed report
removed (the post with its comments, media rows and engagement rows; the comment; the message), then the report, 6 years after
closure (7 years if the report concerns a minor) **[CHANGED v0.6 — 2026-11-11]**. Until then the removed text stays, exactly as (b) describes, and it stays
longer where the report is open, escalated, under an active admin hold or blocked (R36(d)). **[ACTION FOR REVIEW]** the question
in (b) stands for the period before the sweep.

**[CHANGED v0.6 — 2026-11-11]** **Update, v0.6:** the period before the sweep is now 6 or 7 years after closure, not 12 months or 6 years. Removed text, and the stored copy of a removed
item, therefore stays far longer than v0.5 said (the stored **files** of a removed post are unchanged: private copy deleted at closure, Decision Log #484).
**[FOR FOUNDER — not a counsel blocker]** whether removed text should have a shorter clock than the report that removed it.

**(c) The author can still delete a removed post.** `DELETE /posts/:id` is not blocked for the author of a removed post;
the hard delete removes the post row and with it the item the removal rests on (the report keeps its own record). The
stored files are protected separately (see (g)).

**(d) Appeals.** An overturned appeal on a `content_removed` report clears the removal on that item (and a comment is counted
again). An upheld appeal, or the lapse of the appeal window (30 days by default, founder decision, Decision Log #442),
closes the report (`reportClosedAt`); closure is what starts the deletion of a removed post's stored files.

**(e) Data access is unchanged.** The author's own "Download my data" still includes the full text of their own posts,
comments and sent messages **including ones a moderator has removed**. Probably right (it is the person's own data) but it
means a removed item's text is still downloadable by its author. **[OPEN]** founder.

**(f) Effects not decided.** Engagement points already earned on a removed item stay; a removed Contest entry is hidden from
entry lists but its entry, votes and impression rows remain and any ranking or points effect is unchanged; how an admin who
is not child-safety-vetted sees a removed item about a minor is recorded, not decided; the guardian of a minor whose content
is removed receives a notice of the *kind* of action only, never the reason or the content (build-register B-279).
**[CHANGED v0.5 — 2026-11-11]** A removed Contest entry's effect is decided by Decision Log #488 (it leaves the ranking and its points are revoked, both
restored on overturn) but this pass did not check that it is built; and the vetted-only view of a removed item about a minor is
answered only for message **context** and the edited original (R33(f)), not for the removed item itself.

**(g) Media of a removed post (Decision Log #484, B-290).** In short: the public copy of every file is withdrawn (copied to
the private prefix, size verified, then the public object deleted) as soon as the removal is recorded; the private copy is
kept so an overturned appeal can republish it; when the removing report **closes**, a daily sweep deletes the private copy
too, except where the uploader has an active admin hold or the post has another unclosed report. The full account,
including a short window in which the public object can still exist, is in `docs/dpia-addendum-post-media-draft.md` §1.5.

*Draft severity: moderate-to-high. Draft likelihood: certain (it is how the product is built). Placeholder ratings for
counsel.*

### R35 — Suspending an account on a report: speed, notice to the person, and what a wrongful suspension costs

**[CHANGED v0.5 — 2026-11-11]** *New in v0.5. Sources: `modules/account-suspension/account-suspension.service.ts`; `modules/moderation/moderation.service.ts`
(`actionReport`, `decideAppeal`, `appealReport`); `modules/auth/registration/email/registration-email.service.ts`
(`sendAccountSuspendedEmail`, `suspensionReasonLine`, `sendAccountReinstatedEmail`); `modules/feed/feed.service.ts` (author
filter); `modules/guardian-security-notice`; Decision Log #485, #458, #138; build-register B-291, B-292, B-295, B-279;
`docs/docs-suspension-retention-decisions-2026-11-11-report.md`. Nothing was run.*

**(a) What is built.** Recording the action `user_suspended` on a report now **suspends the account behind the target**, in the
same database transaction that records the action. It is offered only for **user, post, comment and message** targets; any other
target type is refused (`400`). After the commit, in order: every session of the account is ended; the account's baseline
engagement points are revoked (**not restored if the suspension is lifted**); the guardian of a person under 18 is told **the
kind of action** once (`account_suspended`; not sent while the "withhold guardian notices" flag of Decision Log #458 is set); and
the person is emailed (b). Sign-in is then refused with the generic "Invalid credentials" message, so the person learns the
reason only from the email. The posts of a suspended author drop out of feeds (the feed filters on authors whose status is
`active` or `deleted`). The account stores `User.suspendedByReportId`, a pointer to the one report that caused it. The user-page
suspension (admin Users screen) uses the **same code path**, requires a reason category, and sends the same email. There is **no
separate "ban" state**; deleting an account is a different action and is refused while an admin hold is active. One moderator
records the action; no second person approves a suspension (the second-reviewer rule of Decision Log #138 applies to appeals).

**(b) Notice to the person, and the tipping-off question.** The email is sent **at once and automatically** to the suspended
person's own address for **every** suspension. It says the account is suspended "for" a fixed plain-words reason chosen from the
report's reason category (for example "harassing or bullying other people"), says how to appeal through the Contact Us page, and
never names the reporter, quotes the report or states a duration. The generic line "breaching our community rules" is used for the
categories `child_safety_concern`, `other`, a missing category and any unknown one, so the email never names a child-safety
matter. The reinstatement email carries no reason. Both are tagged `[COPY PENDING LEGAL REVIEW]`; the category-to-words map is
an adopted default. **Risks for counsel:** (i) the person learns they were reported and for roughly what category; in a
two-person thread that may let them infer who reported them; (ii) for a serious matter that may be under investigation by an
external authority, an automatic email to the account holder at the moment of suspension could prejudice that investigation, and
**no switch withholds the email to the person for a given report** (the flag of Decision Log #458 withholds only notices to a
guardian); (iii) suspension is not blocked by an active admin hold (the service contains no hold check) **[CHANGED v0.6 — 2026-11-11]** (now a founder decision, Decision Log #494; no counsel position); (iv) for a minor, the
email goes to the minor's own address and the guardian receives a separate notice of the kind of action, unless it is withheld.
**[ACTION FOR REVIEW]** whether notice should ever be delayed or withheld, and who decides.

**(c) Wrongful or mistaken suspension: what protects the person, and what does not (as built).** Protections: the email names
the appeal route; a manual reinstatement from the user page clears the link and sends the reinstatement email; and when an appeal
against the **suspending report** is overturned the account is reinstated automatically (only if that report caused the
suspension). **Gaps as built:** (i) a suspended person cannot sign in, but `POST /reports/:id/appeal` accepts an appeal only
from the signed-in reported user, so **a person suspended by a report cannot file an appeal through the product**; the only route
is a Contact Us enquiry, and there is no code path that turns an enquiry into an appeal. The staff-recorded appeal that Decision
Log #485 decides (B-292) is **not built**, so the automatic reinstatement on an overturned appeal cannot currently be reached,
and the 30-day appeal window keeps running; (ii) earned points are not restored; (iii) there is no maximum duration and no
scheduled review of a suspension; (iv) if the suspending report is deleted by the retention sweep (R36) the pointer becomes empty,
the account stays suspended and can then only be reinstated by hand; (v) with two reports, the pointer holds the first;
overturning the second changes nothing, and what a manual reinstatement does while another report's appeal is pending is
recorded but not decided (register Section 84b); (vi) a non-vetted moderator can suspend a child on a message report whose
context is hidden from them (R33(f)(iii)); (vii) whether suspending a **child's** account is proportionate for each reason
category is a question for counsel. **[ACTION FOR REVIEW]** all of (i) to (vii).

**[CHANGED v0.6 — 2026-11-11]** **Update to R35, v0.6.** *Sources: `modules/moderation/moderation.service.ts` (`recordAppealOnBehalf`, `decideAppeal`, `assertVettedToActOn`),
`modules/contact/contact.constants.ts`, `modules/moderation/report-retention.service.ts`, `modules/account-suspension/account-suspension.service.ts`; Decision Log #138,
#440, #460, #491, #492, #493, #494; build-register B-292, B-297, B-298, B-299; PRs #730, #731, #732, #735. Nothing was run.*

1. **(c)(i) is answered in code, but only partly in the product.** A suspended person still cannot call `POST /reports/:id/appeal` (it needs a signed-in
   user). What now exists: a seventh public Contact Us category, key `suspension_appeal`, label "Appeal a suspension" (the API accepts it and Figma draws it;
   **[CHANGED v0.7 — 2026-11-12]** the public Contact Us page offers it in its category list and shows the helper line while it is chosen, and the admin Contact enquiries
   filter, list and detail labels carry it: `apps/web/src/api/contact.ts`, `ContactPage.tsx`, `apps/admin/src/api/contactEnquiries.ts`, PR #739; v0.6 said these did not and that the key appeared only under `services/api`); and
   `POST /admin/moderation/reports/:id/appeal`, which lets a moderator or superadmin record an appeal on the person's behalf. Rules as built: only for a report
   whose action was `user_suspended`; the report must be actioned and not already appealed; the reported account must still exist and not be anonymised; the same
   30-day window counted from the decision; a written reason is required; the same vetting gate as acting on the report (item 3); the recording admin is stored
   and **may not decide the appeal**, and neither may the admin who took the original action (Decision Log #138 unchanged), so a staff-recorded appeal needs a
   third admin; the reported person is sent nothing; the admin action log records the status only, never the reason text. A pending appeal pauses the closure
   clock, so the report stays out of the retention sweep while it is pending. A suspension made from the user page has no report: a moderator reviews the
   Contact Us enquiry and may reinstate from the user page (Decision Log #485(f)).
2. **What an appeal puts in the database about a person who may be a child.** (a) The Contact Us enquiry holds the name, email, subject and message the person
   typed; the helper line (B-298) asks for the email address on the account, so the enquiry can tie a child's account to an address. A suspended person cannot
   sign in, so the enquiry is stored as a guest's. It is deleted 12 months after its last message (Decision Log #440 and #460, the founder's figure, not
   counsel's) **unless it is escalated into a report**, when it follows the report (R36(i)). (b) The staff-typed appeal reason is stored in `Report.appealReason` and
   lives as long as the report (R36(b)). (c) **The enquiry inbox (list and detail) has no child-safety-vetting gate**: any moderator or superadmin can read it;
   the only vetting check on that route is when an admin escalates with the minor flag set. An enquiry from a child about their own suspension is therefore
   readable by non-vetted staff, and the rules that protect a `concernsMinor` report do not reach it. **[FOR FOUNDER — not a counsel blocker]** whether the inbox should hide, from
   non-vetted staff, an enquiry whose sender's account belongs to a minor. Not decided and not changed.
3. **(c)(vi) is superseded for message reports** (Decision Log #491): recording an action (so also a suspension) on a message report needs a vetted admin where the
   sender or any participant is under 18; see the R33(f) update for the exact rule and for what is still ungated (post, comment and user reports; the user-page
   suspension; the hold routes).
4. **(b)(iii) is a decision, not an open point.** The founder decided there is no legal-hold check on a suspension (Decision Log #494). It is not assessed by
   counsel. The reinstatement email says nothing about points, and the emails as built are the source of truth (#494).
5. **(c)(iv) changes shape.** When the sweep deletes a suspending report, `User.suspendedByReportId` is still emptied, the account stays suspended and can then be
   reinstated only by hand. With the new clock that is 6 or 7 years after the report closed, so a suspension that nobody lifts outlives the evidence for it. **[FOR FOUNDER — not a counsel blocker]** no maximum duration or scheduled review of a suspension
   exists (unchanged).
6. **Recorded, not decided, stays open (register Section 85c): the suspension email goes to the address on file.** If someone changed the account's email address
   before the suspension, the real owner is not told, and an email that names a reason category reaches the new address. Not tested. **[FOR FOUNDER — not a counsel blocker]** whether the
   email should also go to a previous address or be held when the address changed recently. Nothing is decided.

*Draft severity: high (a restriction on an account, sometimes a child's, decided by one person and communicated automatically).
Draft likelihood: moderate. Placeholder ratings for counsel.*

### R36 — Reports: what is kept, for how long, and what the deletion sweep takes with it

**[CHANGED v0.5 — 2026-11-11]** *New in v0.5. Sources: `modules/moderation/report-retention.service.ts`, `report-retention.config.ts`;
`modules/account-hold/account-hold.rules.ts` (`reportClosedAt`, `findActiveAccountHold`);
`modules/post-media/rejected-media-evidence.util.ts` (`removedMediaDeletableNow`); `modules/messaging/message-retention.service.ts`;
`schema.prisma` (`Report`, `ReportContextMessage`, `AccountHold`); Decision Log #487, #482, #484, #466, #442; build-register
B-294, B-206. Nothing was run.*

**(a) What a report holds.** The reporter's free text (up to 500 characters), the reporter's account id or, for a logged-out
report, a contact email and optionally a name; the target; the reason category; severity; `concernsMinor`; escalation notes and
whether an external authority was contacted; the action taken and the appeal fields; the links to any context messages; and, through
the removed-content columns, the soft-removed post, comment or message (R34). Reports are the highest-sensitivity records in the
system (§1.3).

**(b) The clock (Decision Log #487 and #490, founder decisions; B-294, PR #725; B-299, PR #735).** A daily sweep (04:15) deletes a report when it has been
**closed** for more than the period: **6 years**, or **7 years if `Report.concernsMinor` is true** **[CHANGED v0.6 — 2026-11-11]** (v0.5: 12 months and 6 years) (a report in the
`child_safety_concern` category always is, Decision Log #466). Both periods are configuration
(`REPORT_RETENTION_YEARS`, `REPORT_RETENTION_CONCERNS_MINOR_YEARS`). "Closed" is the computed moment `reportClosedAt`: for a
dismissed report, the review time; for an actioned report with no appeal, the review time plus the appeal window (30 days by
default, Decision Log #442); after an upheld appeal, the time the appeal was decided. **A report that is still open, awaiting an
appeal, or reopened by an overturned appeal has no closure and is never due.** At most 100 reports are deleted per run. ****[CHANGED v0.6 — 2026-11-11]** The
6 and 7 years sit inside the "6–7 years" that the legal draft records as counsel's approved retention for moderation cases (v0.7 resolved decision 10), so
v0.5's "unverified for UK law" caveat on the old 6-year figure no longer applies to these figures; this DPIA has not seen counsel's advice itself, and the
range was not checked for Nigeria, the US or the EU. See (g) for the two narrow legal questions that remain, and what happens to a report that is never closed.

**(c) What goes with the report, in one transaction, in this order.** First, the content the report removed: the post (with its
media rows, comments, likes, saves, views, hashtag links, media reports and the like and comment notifications that point at it;
each stored file is deleted afterwards through a deferred-deletion record, so a failed delete is retried), the comment or the
message (with its hide rows, and the conversation if it is left empty). Second, the report's context links; **the context messages
themselves stay** and then fall to the 12-month message sweep (R33), so the reported message, if it was not removed, is deleted
by that sweep (04:00) at its next run. Third, the report. Re-checked inside the transaction. **Never touched:** the admin action
log, earned points, and the "moderation decision" notifications that point at the report. `User.suspendedByReportId` is emptied
(R35(c)(iv)).

**(d) What keeps a report.** *Kept and retried* ("skipped") while: an active admin hold (legal **or** bad-faith) is on the
reporter, on the account behind the target, or, for a message report, on the reported message's sender or any other participant
of its conversation; the report has been **escalated** (kept until counsel answers B-206, the statutory-preservation question);
the removed post's stored file is not yet deletable under the removed-media rule; or another report that is not yet closed
targets the removed item or the comments under a removed post. *Kept and counted in the log* ("blocked") when another record
depends on it and no rule says what to do: **[CHANGED v0.6 — 2026-11-11]** (v0.5 also listed an account-hold record and an escalated Contact Us enquiry here; both are now detached, see (i)) the removed post is a **Contest entry** (deleting it would delete votes, winners and impressions); or a removed message
is attached as context to a **different** report. These cases are open-ended. **[ACTION FOR REVIEW]** whether any of them needs
an end date.

**(e) The hold rules differ by feature (restated, Decision Log #482, #484, #487).**

| Feature | Which active admin hold keeps the data | Whose hold counts |
|---|---|---|
| Direct messages (12-month sweep) | **Legal hold only** | The message's sender, or any other participant of the conversation |
| Stored files of a removed post | **Legal or bad-faith** (and another unclosed report on the post) | The uploader |
| Reports and the content they removed (this sweep) | **Legal or bad-faith** (and escalation, and the cases in (d)) | The reporter, the account behind the target, and for a message report the sender and every participant |
| Account anonymisation (B-044) | **Any** active admin hold: the account is skipped in full | The account |

Effects: a bad-faith hold, placed on a **reporter** for six months, keeps that reporter's reports and what they removed but does
not keep that reporter's old messages. "The accounts involved" in the third row is the builder's reading, not a founder
statement (register Section 84b). **[ACTION FOR REVIEW]** whether the differences are intended and whether one rule should
apply everywhere.

**(f) Effects on earlier risks.** R33(c) and R34(b) (above) are amended: "no retention clock for reports" holds now only for
open, appeal-pending, escalated, held and blocked reports. Deletion is a hard delete from the live database; backups, R2
versioning and the provider's own copies were not examined, and the sweep logs counts only (no record of which report was
deleted other than the admin action log, which is never touched).

**[CHANGED v0.6 — 2026-11-11]** **Update to R36, v0.6.** *Sources: `modules/moderation/report-retention.config.ts` and `report-retention.service.ts`; migration
`20261129090000_account_hold_report_detachable`; `modules/account-hold/account-hold.rules.ts`; `modules/moderation/moderation.service.ts`; legal draft v0.7 resolved decision
10; Decision Log #490, #493, #491, #492, #440; build-register B-299, B-297, B-292, B-206; PR #735. Nothing was run.*

**(g) The figures, and the two narrow legal questions.** Decision Log #487 had set 12 months and 6 years, which is shorter than the range counsel is recorded
as having approved; #490 restores it. The legal draft records "6–7 years for data tied to a concluded investigation or moderation case" as a counsel review
outcome; this DPIA relies on that record and has not seen the advice. **[ACTION FOR REVIEW]** (1) whether a report that was **dismissed** (no action taken), or
that was filed in bad faith, is "data tied to a concluded investigation or moderation case" and so inside the approved range, or needs a shorter period; (2)
whether the split by `concernsMinor` (6 years, 7 years) is the split counsel meant, since the range was recorded as "6–7 years", not as a rule.

**(h) A larger and older store: what that means, and what protects it.** Reports are the highest-sensitivity records in the system (§1.3). With the new clock the
typical report is kept six times as long as v0.5 said (6 years instead of 12 months); a child-safety report one year longer; a message report carries up to 20 context messages of a child's
private chat for the same period (R33(c)); an appeal adds the staff-typed reason (R35 update). More people's records are in the store at any moment, and a leak
or a loss would reach further back. *Controls that exist, read from the code, none new:* the daily sweep (04:15, at most 100 per run, re-checked inside the
transaction, counts-only log, nothing logged about which report went); access limited to the moderator and superadmin roles (editors have none) on a separate
admin sign-in domain; the child-safety-vetting gate on `concernsMinor` reports and, now, on acting on a message report that involves a child (R33(f) update); the
vetted-only reading of message context and edited originals (Decision Log #486); the admin action log, which records actions, an appeal being recorded and a
hold being placed, and which the sweep never touches. *What is not there:* no field-level encryption of `Report` columns (they are plain columns, incident plan
§1); **reading a report is not logged** (the action log has actions, not views); this pass found no step that redacts or minimises a report between its
closure and its deletion; backups, R2 versioning and the provider's own copies were not examined. **[FOR FOUNDER — not a counsel blocker]** whether reads of child-flagged reports
should be logged, and whether anything should be minimised at closure. Nothing is decided or invented here; for the breach side see the incident plan §8.4 and Q21.

**(i) What no longer blocks the sweep, and what stays open** (Decision Log #493; B-299).
1. **A hold record no longer blocks.** When a due report is purged, an `AccountHold` row that references it stays and its `reportId` is set to NULL; the hold is
   otherwise unchanged (the migration relaxes the CHECK that required a bad-faith hold to keep a report). A detached hold is audit evidence that outlives the
   report.
2. **An escalated Contact Us enquiry no longer blocks.** It is detached (`escalatedReportId` set to NULL) and goes back to its normal 12-month clock from its
   own last message, so for an old enquiry the next daily enquiry job (03:45) can delete it.
3. **Still blocked and counted:** the removed post is a Contest entry (until Decision Log #488 is built; **this pass did not check whether it is**); a removed
   message is attached as context to a different report. **Still skipped:** an active admin hold on an involved account, an escalated report, media not yet
   deletable, another unclosed report on the same item.
4. **Recorded, not decided, stays open (register Section 85c): a held report keeps its enquiry.** While an active hold or an escalation keeps a report, the
   enquiry escalated into it (a name, an email, a message, and possibly a child's account email from a suspension appeal) is kept as well, because the 12-month
   enquiry job never deletes an escalated enquiry. It returns to the 12-month clock only after the report is purged, and a legal hold has no end date.
   **[FOR FOUNDER — not a counsel blocker]** whether a held report should detach its enquiry earlier. A pending appeal also keeps its report (the closure clock is paused), which is intended.

*Draft severity: high (the records hold allegations about and by children). Draft likelihood: certain (it is how the product is
built). Placeholder ratings for counsel. **[CHANGED v0.6 — 2026-11-11]** v0.6 changes no rating; a longer-kept store is a reason to revisit them, not a new rating.*

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
| **R33** Private messages | Messages are not E2E encrypted (stated, not mitigated); 12-month deletion of every message (minors and adults); exceptions only for reported messages, report context and active legal holds; a reporter's context is limited to 20 messages in a 10-before / 10-after window, checked server-side; only the recipient can report; staff-only read; filing notifies nobody; vetting gate for `concernsMinor` reports | `MessageRetentionService`; `MessagingService`; `ModerationService.createReport` / `resolveContextMessageIds` / admin report detail; `AdminUser.childSafetyVetted` (Decision Log #477, #478, #482, #466). **Open:** the 12-month figure has no counsel position; exceptions are open-ended because reports have no retention clock; the vetting gate keys off the report's category, not the participants' ages; other participants are not told their messages can be shown to staff; no at-rest encryption verified  **[CHANGED v0.5 — 2026-11-11]** Message context is now hidden from non-vetted staff when any participant is under 18 (R33(f) update); closed reports are deleted by a retention sweep (R36); the bare reported message and the vetting requirement to act are unchanged. | **Code merged** — partial; not verified live |
| **R34** Soft removal | Moderator removal hides the item from users and keeps it for staff; reported item only, never context; appeal restores; stored files of a removed post follow a two-stage deletion (public copy withdrawn, private copy deleted when the report closes, unless an admin hold or another open report applies) | `content-removal.util.ts`; `ModerationService.actionReport` / `decideAppeal`; `PostMediaObjectsService.withdraw`; `RejectedMediaSweepService.confirmModerationRemovals` (Decision Log #483, #484). **Open:** no retention clock for removed text; author can still hard-delete a removed post; own-data export still includes removed items; Contest and points effects undecided; evidence set-aside for statutory reporting is B-206 (counsel)  **[CHANGED v0.5 — 2026-11-11]** The report sweep now hard-deletes removed content with its report, 6 years after closure (7 years if the report concerns a minor) **[CHANGED v0.6 — 2026-11-11]** (R36). | **Code merged** — partial; not verified live |
| **R35** Suspension on a report | **[CHANGED v0.5 — 2026-11-11]** A moderator's `user_suspended` suspends the account in the same step; sessions ended, points revoked, guardian told the kind of action, the person emailed with a fixed plain-words reason; reinstatement email; automatic reinstatement on an overturned appeal of the suspending report; manual reinstatement from the user page | `AccountSuspensionService`; `ModerationService.actionReport` / `decideAppeal`; `RegistrationEmailService` (Decision Log #485, #458, #138). **Open:** **[CHANGED v0.6 — 2026-11-11]** a suspended person appeals through Contact Us and staff record the appeal (B-292 and B-298 merged in the API; web Contact Us page and admin inbox not built; the inbox has no child-safety gate; the suspension email goes to the address on file); no withholding of the email to the person; points not restored; no maximum duration or review; pointer lost if the report is deleted; a non-vetted moderator can still suspend a child on a post, comment or user report and from the user page (message reports now need a vetted admin, Decision Log #491); wording and the reason map not counsel-reviewed | **Code merged** (B-291) — partial; not verified live |
| **R36** Report retention | **[CHANGED v0.5 — 2026-11-11]** Closed reports are deleted 6 years after closure (7 years if `concernsMinor`; **[CHANGED v0.6 — 2026-11-11]** v0.5 said 12 months and 6), with the content they removed; context links go, context messages fall to the 12-month message sweep; holds, escalation, open and appeal-pending reports, and four blocked cases keep a report | `ReportRetentionService` (04:15 daily, 100 per run); `reportClosedAt`; `findActiveAccountHold`; `removedMediaDeletableNow` (Decision Log #487, #482, #484). **Open:** **[CHANGED v0.6 — 2026-11-11]** the 6/7-year range is the one recorded as counsel-approved in legal draft v0.7 (not independently confirmed here) and whether a dismissed report fits it is a counsel question; a longer, older store with no field-level encryption and no logging of reads; held or escalated reports keep their enquiry until detached; open-ended cases; the hold rules differ by feature; backups and R2 versioning not examined | **Code merged** (B-294) — partial; not verified live |

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
| 29 | **[CHANGED v0.4 — 2026-11-10]** **Message retention (R33):** 12 months from sending for children's and adults' private messages (founder decision, Decision Log #478); no counsel position; whether it is defensible and whether shorter is required | Flagged for counsel; nothing decided by this draft | Counsel + founder |
| 30 | **[CHANGED v0.4 — 2026-11-10]** **Messages kept under a report, as report context or under an active legal hold (R33(c))** — open-ended because reports have no retention clock; bad-faith and report-derived holds do not exempt messages | Flagged for counsel; nothing decided | Counsel + founder |
| 31 | **[CHANGED v0.4 — 2026-11-10]** **Reporter-added context (R33(d)–(f)):** necessity and proportionality of showing up to 20 surrounding messages (including other children's and the reported person's) to staff; no notice to other participants; vetting gate keyed to the report category, not to the participants' ages | **NOT ASSESSED** by counsel | Counsel |
| 32 | **[CHANGED v0.4 — 2026-11-10]** **Messages not end-to-end encrypted; at-rest encryption by the host unverified (R33(a), R10)** | Stated; no decision | Counsel + founder |
| 33 | **[CHANGED v0.4 — 2026-11-10]** **Soft removal (R34):** retention of removed text with no clock; author's ability to hard-delete a removed post; removed items in the author's own data export; Contest and points effects | Flagged for counsel; nothing decided | Counsel + founder |
| 34 | **[CHANGED v0.4 — 2026-11-10]** **Media of a removed post (R34(g); addendum §1.5):** the window before the public object is withdrawn; the two-stage deletion; evidence set-aside is B-206 | Flagged for counsel; nothing decided | Counsel |
| 35 | **[CHANGED v0.5 — 2026-11-11]** **Suspension on a report (R35):** lawfulness and proportionality of an account suspension recorded by one moderator and applied at once, for adults and for children; no second approval; points revoked and not restored | Flagged for counsel; nothing decided by this draft | Counsel + founder |
| 36 | **[CHANGED v0.5 — 2026-11-11]** **Notice to the suspended person and tipping off (R35(b)):** automatic email at the moment of suspension, with a category-based reason; no switch to delay or withhold it for a serious or externally investigated matter; suspension is not blocked by an active hold **[CHANGED v0.6 — 2026-11-11]** (founder decision, Decision Log #494; no counsel position) | Flagged for counsel; nothing decided | Counsel + founder |
| 37 | **[CHANGED v0.5 — 2026-11-11]** **Appeal route for a suspended person (R35(c)):** the product's appeal route needs a signed-in user; the staff-recorded appeal (B-292) and the Contact Us "Appeal a suspension" category (B-298) are merged in the API; **[CHANGED v0.7 — 2026-11-12]** the Contact Us category is now also offered on the web page and in the admin inbox (PR #739; v0.5 and v0.6 said these were not built); the in-app appeal still needs a sign-in; the 30-day window runs meanwhile **[CHANGED v0.6 — 2026-11-11]** | Gap flagged; build item B-292 | Founder + counsel |
| 38 | **[CHANGED v0.5 — 2026-11-11]** **Suspension pointer and duration (R35(c)(iii)–(v)):** no maximum duration or review; the pointer to the suspending report is emptied when the report is deleted; overlapping suspensions undecided | Flagged; register Section 84b | Founder |
| 39 | **[CHANGED v0.5 — 2026-11-11]** **Report retention periods (R36(b)):** 6 years, and 7 years if the report concerns a minor, after closure (counsel's recorded range, legal draft v0.7); whether a dismissed report fits the range; a report that is never closed has no end **[CHANGED v0.6 — 2026-11-11]** | Flagged for counsel; counsel may confirm; the build was not held for it | Counsel + founder |
| 40 | **[CHANGED v0.5 — 2026-11-11]** **Open-ended report cases and hold rules (R36(d)–(e)):** escalated, held and blocked reports have no end date; messages follow a legal-hold-only rule while reports and removed files follow legal-or-bad-faith; what counts as "the accounts involved" | Flagged for counsel; nothing decided | Counsel + founder |
| 41 | **[CHANGED v0.5 — 2026-11-11]** **Vetted-only message context, what remains (R33(f) update):** the bare reported message is visible to non-vetted staff when a child is involved; the vetting requirement to act keys off `concernsMinor` and, for message reports, the participants' ages (#491, v0.6); post, comment and user reports are not gated by participants' ages; "under 18" is a daily-updated flag | Gap narrowed, not closed; flagged for counsel | Counsel + founder |
| 42 | **[CHANGED v0.6 — 2026-11-11]** **Retention range fit (R36(g)):** whether a dismissed or bad-faith report is "data tied to a concluded investigation or moderation case"; whether the 6-year / 7-year split by `concernsMinor` is the split counsel meant | Flagged for counsel; counsel's advice not seen by this draft | Counsel |
| 43 | **[CHANGED v0.6 — 2026-11-11]** **A larger, older store of reports about and by children (R36(h)):** no field-level encryption of `Report` columns; reading a report is not logged; nothing minimised at closure; backups not examined | Stated; nothing decided or built | Founder + `backend-api` |
| 44 | **[CHANGED v0.6 — 2026-11-11]** **Contact Us "Appeal a suspension" enquiry (R35 update, items 1–2):** may hold a child's account email; the inbox has no child-safety-vetting gate; deleted 12 months after the last message unless escalated | Gap flagged; nothing decided | Founder |
| 45 | **[CHANGED v0.6 — 2026-11-11]** **What still does not need a vetted admin to act (R33(f) update):** post, comment and user reports about a child outside `child_safety_concern`; the user-page suspension; the hold routes | Gap flagged; nothing decided | Founder |
| 46 | **[CHANGED v0.6 — 2026-11-11]** **The suspension email goes to the address on file (R35 update, item 6)** — recorded, not decided (register Section 85c) | Open | Founder |
| 47 | **[CHANGED v0.6 — 2026-11-11]** **A held or escalated report keeps its enquiry until the report is purged; a legal hold has no end date (R36(i)(4))** — recorded, not decided (register Section 85c) | Open | Founder |

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

*v0.6 (2026-11-11) note: this revision restores report retention to 6 and 7 years, records who may act on a message report that involves a child, and records the
appeal route for a suspended person and what it puts in the database, revisiting R33(f), R35 and R36; every changed passage is marked "CHANGED v0.6". It does not
complete, advance or approve the DPIA, it closes no risk, no legal proposition in it was checked against a primary source, and the Section 6 sign-off block remains
empty; "Reviewed by counsel: NOT YET."*

*v0.5 (2026-11-11) note: this revision updates the DPIA for suspension of an account on a report, the vetted-only visibility
of message context when a child is involved, report retention and the hold rules compared, and adds R35 and R36; every changed
passage is marked "CHANGED v0.5". It does not complete, advance or approve the DPIA, it closes no risk, no legal proposition in
it was checked against a primary source, and the Section 6 sign-off block remains empty; "Reviewed by counsel: NOT YET."*

*v0.4 (2026-11-10) note: this revision updates the DPIA for direct-message retention and encryption, reporter-added message
context, moderator soft removal and the media of a removed post, and adds R33 and R34; every changed passage is marked
"CHANGED v0.4". It does not complete, advance or approve the DPIA, no legal proposition in it was checked against a primary
source, and the Section 6 sign-off block remains empty; "Reviewed by counsel: NOT YET."*

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
