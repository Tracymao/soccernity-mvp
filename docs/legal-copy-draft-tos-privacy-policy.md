# Soccernity — Draft Legal Copy: Terms of Service & Privacy Policy

## FIRST-PASS DRAFT — NOT APPROVED, NOT LEGAL ADVICE, NOT READY TO SHIP

**Status: draft for counsel review. Every section below is a working draft, not final policy.**

This document is a first-pass draft produced by the `safeguarding-drafter` agent (see
`CLAUDE.md` non-negotiable #2 and the `safeguarding-drafter` agent definition). It has **not**
been reviewed by Soccernity's safeguarding/legal counsel — a role recorded as a priority hire
in Inventor's Log Book Section 15 and, at the time of writing, unfilled. Nothing in this
document should be read as a statement that either the Terms of Service or the Privacy Policy
is legally sufficient, complete, or compliant with UK GDPR, Nigeria's NDPA 2023, the Online
Safety Act, the ICO's Age Appropriate Design Code, or any other regime. **A policy is only a
policy once a competent person has reviewed, challenged, and signed off on it.** Until the
sign-off block at the end of this document is completed, this file is working material for
that person to react to and substantially rewrite — not a deliverable to publish.

Every retention period, age threshold, and factual claim about what Soccernity does with data
is marked **[PROPOSAL]** (a suggestion for counsel/founder to confirm, revise, or reject) or
**[OPEN — Decision Log #N]** (a genuinely undecided question this draft deliberately does not
resolve). Do not strip these markers when this copy moves into Figma or code — they are the
signal that tells a reviewer what still needs a decision.

This draft **does not resolve Decision Log #4** (jurisdictional scope of the safeguarding
framework beyond UK GDPR and Nigeria's NDPA 2023 — e.g. whether EU GDPR, COPPA, or other
regimes apply). Both documents below are written against **UK GDPR and Nigeria NDPA 2023 as a
working baseline**, because Soccernity's own Decision Log #10 already grounds the guardian-consent
flow in both, and because the founder's Phase 1 go-to-market (Log Book Section 13) launches in
Nigeria and England specifically. That baseline is not a finding that no other regime applies —
if Soccernity ever serves users from a jurisdiction with a different or additional legal floor
(the EU, the US, or elsewhere), **this document must be revisited, not just amended**, the same
warning the DPIA draft (`docs/sprint-1-dpia-outline-draft.md`) already gives for the same open
question.

- **Document:** Draft Terms of Service and Privacy Policy, closing Decision Log #203 (Build
  Plan Section 9) — this draft **unblocks** counsel review; it does not close #203 itself.
  #203 remains open until counsel signs off (see the sign-off block).
- **Grounded in:** MVP Build Plan Section 8 (8.1 DPIA outline, 8.2 retention skeleton, 8.3
  guardian-consent flow, 8.4 moderation/appeals), Section 3 (data model), Section 9 (Decision
  Log entries #4, #8, #10, #19, #34, #37, #38, #40, #42, #44, #45, #58, #128–#130, #153–#155),
  Log Book Section 10 (safeguarding principles) and Section 24.5, `docs/sprint-1-dpia-outline-draft.md`,
  and `CLAUDE.md`'s "Where things stand" record of what is actually built as of Sprint 2.
- **Draft date:** 2026-09-05
- **Drafted by:** `safeguarding-drafter` agent (automated first pass)
- **Reviewed by counsel:** NOT YET — see the sign-off block at the end of this document
- **Version:** 0.1 (draft)

---

## 0. A note on Figma insertion sizing — read before pasting this into either frame

The task briefing this draft was written against gives two target text boxes on the newly-split
Terms of Service / Privacy Policy Figma frames (`weZWWqggy9j13eX8bhFgs6`):

- **Desktop body box** (node `6114:14250`, Terms of Service Desktop — Logged In): ~1059×1084px.
- **Mobile body box** (node `6116:14616`): ~335×2865px.

A rough capacity estimate, method disclosed rather than asserted as precise: at a legal-document
body size of ~14–15px with ~22–24px line height, the **desktop** box's 1084px height fits
roughly 45–48 visible lines before scrolling; at ~1059px width and an average character width of
~7–8px for that font size, that's roughly 130–150 characters per line — call it **~6,000–7,000
characters, or ~1,000–1,150 words, visible without scrolling**. The **mobile** box's much taller
2865px gives roughly 125–130 visible lines at a narrower ~40–45 characters each — call it
**~5,000–5,800 characters, or ~900–1,050 words, visible without scrolling**.

**Both documents below run well past that** — the Terms of Service is roughly 2,400 words and
the Privacy Policy roughly 3,600 words, because a grassroots platform that processes minors'
data via a guardian-consent flow, discloses a leaderboard showing minors' real names, and
operates a 30-day-grace-then-hard-delete-cascade account-deletion policy cannot honestly say all
of that in ~1,000 words without cutting content this project's own non-negotiables require
disclosing. **This is not this draft padding the copy** — see the per-document word counts below
for what a reasonably complete version of each document actually needs, and treat any pressure
to cut it down to fit the box as a reason to resize/scroll the box, not to cut required
disclosures.

**Flagged for whoever inserts this into Figma / converts it to code**: the realistic options are
(a) make the body text box an internally scrollable region — the standard, expected pattern for
a ToS/Privacy Policy page on virtually every production site, and the most likely fix — or
(b) substantially grow the frame's height so the box can hold the full text without scrolling.
Compressing either document below its real content to fit the box as currently sized is **not**
a safe option here, given non-negotiable #2 and the live minors'-data obligations this document
exists to disclose accurately.

---

## PART A — Draft Terms of Service

**Word-count guidance for this section:** ~2,400 words as drafted below. See Section 0 above —
this exceeds both Figma boxes' no-scroll capacity; plan for a scrollable body or a resized frame.

---

# Soccernity Terms of Service

**Effective date: [PROPOSAL — TBD, to be set only once counsel has signed off; do not publish
with a live date before that.]**

**[PROPOSAL] Soccernity is operated by [Soccernity's legal entity name, registration number, and
registered address — TBD; not yet incorporated/confirmed at the time of this draft. Counsel and
the founder must supply this before publication.]** In this document, "Soccernity," "we," "us,"
and "our" refer to that entity; "you" refers to anyone who creates or uses a Soccernity account,
or, where a Player is a minor, to the Player and, where the context requires it, their Guardian
acting on the Player's behalf under the guardian-consent flow described in Section 3.

### 1. What Soccernity is

Soccernity is a platform for unaffiliated, grassroots football players, and for the fans,
coaches, and communities around them. It gives players an identity and a community — a profile,
club fan pages, community discussion ("Banter Rooms" and community groups), a Leaderboard, and
grassroots team/fixture/result record-keeping — without requiring affiliation with a formal club
or league. **Soccernity does not currently offer AI-based talent scouting, a "Talent Passport,"
a scout-facing search tool, or any careers/academy marketplace feature.** Those are documented,
deliberately deferred product ideas (Build Plan Section 2.2) and are not part of the service you
are agreeing to use today. If Soccernity ever launches them, they will be covered by updated
terms and — because they involve materially higher-risk processing of minors' data — a fresh
safeguarding and data-protection review, not a quiet extension of this document.

### 2. Eligibility and age requirements

2.1. You must be at least **[PROPOSAL — currently implemented in the product as age 5; see
Decision Log #19]** years old to create a Soccernity account at all. Soccernity will not create
an account, under any circumstances, for anyone who declares an age below this floor.

2.2. If you are under 18, Soccernity requires the involvement of a parent or legal guardian
before your account has full access to the platform. This applies to the full under-18 age band,
not only the narrower age at which UK GDPR Article 8 itself would require it — a deliberate,
considered safety decision, not an over-reading of the law (Decision Log #8), because Soccernity
is a platform where unaffiliated adults and organisations may eventually seek to contact
grassroots players. Full detail on how this works is in Section 3.

2.3. By creating an account, you confirm that the date of birth you provide is accurate. Providing
a false date of birth to bypass the age floor in 2.1 or the guardian-consent requirement in 2.2 is
a breach of these Terms and may result in immediate account suspension.

2.4. **Guardians.** If you are acting as a guardian confirming consent for a minor's account, by
confirming consent you agree that you are that minor's parent or legal guardian (or otherwise
hold parental responsibility recognised under applicable law), and that you consent to the
processing described in the Privacy Policy on the minor's behalf, on the terms described there.

### 3. Minors' accounts and the guardian-consent process

3.1. When someone under 18 registers, Soccernity captures the name, email address, and
relationship of a parent or guardian before the account is created, and sends that guardian a
single-use consent link by email. **[PROPOSAL] That link currently expires after 72 hours** (see
Decision Log — consent token expiry) and can be re-sent from the account's own status page if it
lapses.

3.2. Until a guardian confirms consent, the minor's account exists but is **restricted**. A
restricted-pending account cannot: have a publicly visible profile; be messaged by or send
messages to unverified accounts; participate in Banter Rooms beyond read-only viewing; or, as
currently implemented, create posts or comments (Build Plan Section 8.3 step 5; Decision Log
#21 for the current scope of what "restricted" covers). A restricted-pending minor also does not
appear in another user's followers/following lists (Decision Log #41), and does not appear in
Leaderboard rankings (Decision Log #45) — see the Privacy Policy for what changes once consent
is confirmed.

3.3. A guardian may change the email address on file while consent is pending. Doing so
**restarts the consent process from scratch**: the previous consent link stops working, the
account remains (or returns to) restricted-pending, and a new single-use link is sent to the new
address (Decision Log #60). This is deliberate — a recorded or pending consent is tied to a
specific person at a specific address, and changing the address without restarting the process
would mean the record no longer reflects who was actually asked.

3.4. **[OPEN — not yet built]** There is currently no in-product way for a guardian to formally
decline consent (as opposed to simply not responding) or to withdraw consent once given. If a
guardian does not respond, the account simply remains restricted-pending indefinitely under the
current implementation. **[PROPOSAL]** Counsel and the founder should decide, and this document
should then be updated to reflect, (a) whether a guardian who wishes to withdraw consent should
use the account deletion process described in Section 8 in the meantime, and (b) whether an
account left unconfirmed for an extended period (a starting proposal only: 12 months) should be
subject to its own retention/deletion rule.

### 4. Your account

4.1. You are responsible for keeping your password confidential and for all activity that occurs
under your account. Tell us promptly if you believe your account has been compromised.

4.2. You may only maintain one personal account. Club fan pages, Banter Rooms, and community
groups are shared spaces within the platform, not separate accounts.

4.3. Soccernity currently supports registering with an email address and password. **[PROPOSAL —
not yet functional]** Sign-in via Google, Apple, or Facebook is visible in the product's design
but is not yet connected to a working login flow (Decision Log #55); this document will need
updating with each provider's own data-sharing terms once that integration goes live.

### 5. Acceptable use

You agree not to use Soccernity to:

- Impersonate any person or organisation, including a club, league, or other user.
- Harass, bully, threaten, or attempt to make unwanted contact with any user, and in particular
  with a minor.
- Post or send content that is unlawful, defamatory, sexually exploitative of a minor, or that
  promotes violence, discrimination, or self-harm.
- Upload a photo or video of another identifiable person — including a child who is not a
  Soccernity user — without a reasonable basis for believing it is appropriate to share (see
  Section 7 for how to report content of yourself or your child that was uploaded by someone
  else).
- Scrape, systematically collect, or attempt to re-identify other users' data, including
  Leaderboard, club-page, or profile data.
- Attempt to circumvent the age-gate, the guardian-consent flow, or the restricted-pending state
  described in Section 3.
- Use the service for any commercial solicitation not authorised by Soccernity, including
  unauthorised recruitment or scouting contact directed at grassroots players.

### 6. Content you post

6.1. You retain ownership of the posts, comments, photos, videos, and other content you submit
("**User Content**"). By posting User Content, you grant Soccernity a non-exclusive, worldwide,
royalty-free licence to host, store, reproduce, and display that content solely for the purpose
of operating and improving the service — for example, showing your post in a feed, a club page,
or a Banter Room to other users, or in a notification to a user you interacted with.

6.2. You are solely responsible for your own User Content. Soccernity is not obliged to monitor
User Content before it is posted, but does operate the reporting and moderation process described
in Section 7, and may remove content or suspend accounts that breach Section 5.

6.3. If you delete a post, comment, or your own account, that content is removed from public
view. Section 8 explains what "deleted" means in terms of how long the underlying data is
actually retained, and what happens to other users' comments, likes, or saves on your deleted
content.

### 7. Reporting, moderation, and appeals

7.1. If you see content or behaviour that breaches these Terms, you can report it against the
specific post, comment, or account (Build Plan Section 8.4). Reports are reviewed by Soccernity's
moderation staff (an "Admin" account with the moderator role).

7.2. Following a report, Soccernity may take action including content removal, a warning, or
account suspension. Both the person who reported and the person reported are notified of the
outcome.

7.3. If you disagree with a moderation decision made against your account or content, you may
appeal it. **An appeal is always reviewed by a different member of the moderation team than the
one who made the original decision** — never the same reviewer (Decision Log #138). This process
is being built into the Admin Console and is not yet fully live in the product as of this draft;
this document will be updated once it is.

7.4. **[OPEN — not built]** There is not yet a way for someone who is not a Soccernity user
(for example, a parent whose child appears in a photo posted by someone else) to submit a report.
**[PROPOSAL]** Counsel and product should decide whether a non-user reporting route is needed
before this platform is considered safe for the grassroots-photography use case it explicitly
supports.

### 8. Ending your account

8.1. You can deactivate your account at any time (a reversible pause — your data is retained and
you can sign back in to reactivate), or request deletion, from your account settings. Both
actions require you to re-enter your password as confirmation, and both immediately sign out
every other active session on your account.

8.2. Requesting deletion does not delete your account immediately. **[PROPOSAL — see the Privacy
Policy, Section 9, for the full retention detail]** Your account enters a 30-day grace period
during which you can still be reached and, if the platform later offers a self-service way to
reverse it, could still change your mind; deletion is not currently reversible through the
product once requested. After that period, your account and its associated content are
permanently deleted, including — because of how deleting your account also removes other users'
comments, likes, and saves on content you posted — some content contributed by other users to
posts that no longer exist once your account is gone. See the Privacy Policy for the specific,
narrow exception made for guardian-consent records.

8.3. Soccernity may suspend or terminate your account for a breach of these Terms, in particular
a breach of Section 5, or where we reasonably believe an account was created in breach of the
age or guardian-consent requirements in Sections 2–3.

### 9. Club pages, the Leaderboard, and public visibility

9.1. Some information about you is visible to other users by default once your account is fully
active (not restricted-pending): your display name, profile content you choose to share, your
posts and comments, your club-page membership, and — where the Leaderboard feature is live —
your ranking and points. **This applies to minors as well as adults**: Soccernity's product
decision is to show real display names on the Leaderboard for all eligible users, including
minors, because the platform's purpose is to give grassroots players visibility to scouts and
clubs (Decision Log #45); a restricted-pending minor is simply absent from this data until
consent is confirmed, not shown under a pseudonym. See the Privacy Policy, Section 10, for the
full detail and for what is deliberately kept private even once an account is active (for
example, a minor's exact date of birth and any un-shared contact details).

9.2. The Leaderboard, Contest, and Competition features described above are still being built as
of this draft and are not fully live; this document reflects the intended design so that anyone
reviewing this draft can assess the real, intended data practice — not only what exists in
production today.

### 10. Disclaimers

10.1. Soccernity is provided "as is." We do not guarantee the service will be uninterrupted,
error-free, or available at all times.

10.2. Live scores, fixtures, and news content are sourced, in part, from third-party sports-data
providers **[OPEN — Decision Log #6, vendor not yet selected]**; we do not guarantee the accuracy
or timeliness of that content.

10.3. **[PROPOSAL — standard limitation-of-liability language; drafted deliberately narrow here
because a platform serving minors should not use broad liability waivers to avoid safeguarding
responsibilities.]** To the fullest extent permitted by law, Soccernity is not liable for
indirect or consequential loss arising from your use of the service. Nothing in these Terms
limits liability that cannot lawfully be limited, including for death or personal injury caused
by negligence, or for any failure to meet our safeguarding obligations to minors using the
platform.

### 11. Changes to these Terms

We may update these Terms from time to time. If a change materially affects your rights, or
affects a minor's account or the guardian-consent process, we will make reasonable efforts to
notify you (and, for a minor's account, the linked guardian) before the change takes effect.

### 12. Governing law

**[OPEN — Decision Log #4]** The governing law and jurisdiction for these Terms depend on the
still-open question of Soccernity's overall jurisdictional scope. **[PROPOSAL]** As a starting
point only: given the Phase 1 launch markets are Nigeria and England (Log Book Section 13),
counsel should confirm whether these Terms should be governed by the law of England and Wales,
by Nigerian law, or should specify different governing law depending on the user's location.
This is not decided here.

### 13. Contact us

Questions about these Terms, or about your account, can be sent to
**support@soccernity.com** (Decision Log #37).

---

## PART B — Draft Privacy Policy

**Word-count guidance for this section:** ~3,600 words as drafted below, including the retention
table. See Section 0 above — this is the longer of the two documents and will need a scrollable
body box or a resized frame more than the Terms of Service will.

---

# Soccernity Privacy Policy

**Effective date: [PROPOSAL — TBD, to be set only once counsel has signed off; do not publish
with a live date before that.]**

This Privacy Policy explains what personal data Soccernity collects, why, how long we keep it,
who we share it with, and what rights you (or, for a minor's account, you and your guardian
together) have over it. It should be read alongside the Terms of Service.

**[PROPOSAL] Soccernity is the data controller for the personal data described in this Policy,
operated by [Soccernity's legal entity name, registration number, and registered address — TBD;
see the same placeholder in the Terms of Service, Section title].**

**A note on scope, carried forward from the project's own DPIA draft
(`docs/sprint-1-dpia-outline-draft.md`) rather than repeated from scratch here:** this Policy is
written against **UK GDPR** and **Nigeria's Data Protection Act (NDPA) 2023** as the baseline —
both regimes Soccernity has already researched and grounded its guardian-consent design in
(Decision Log #10). **Whether Soccernity's data-protection framework needs to extend further —
to EU GDPR, to the US's COPPA, or elsewhere — is Decision Log #4, and remains genuinely open.**
This Policy does not assume that question is closed, and if Soccernity later serves users in a
jurisdiction with a different legal floor, this Policy will need substantive revision, not a
footnote.

### 1. The data we collect

#### 1.1 Account and identity data (all users)

Email address, phone number (optional), password (stored as a secure hash, never in plain text),
display name, date of birth, and — derived from date of birth — whether your account is
classified as belonging to a minor. **[PROPOSAL — flagged for counsel, carried forward from the
DPIA draft]** We currently store your full date of birth, not a derived age band. This is more
data than the age-gate strictly needs to function, and counsel should consider whether a derived
age band, retaining full date of birth only where a specific purpose requires it, would be more
proportionate. This draft does not make that change itself — altering what the platform stores
is a data-model decision (Build Plan Section 9), not something a policy document can do on its
own.

#### 1.2 Guardian data (minors' accounts only)

If you are under 18, we also collect your parent or guardian's name, email address, and their
relationship to you, in order to run the guardian-consent process described in Section 4.
Guardians are themselves data subjects with respect to this information — it is processed only
in connection with the consent flow, and is subject to the retention rules in Section 9.

#### 1.3 Content you create

Posts, comments, photos, videos, and other media you upload; your membership in club pages,
Banter Rooms, and community groups; who you follow and who follows you; posts you save; and
messages you send through the platform's direct-messaging feature.

#### 1.4 Grassroots record-keeping data

If you create or manage a grassroots team page, the team name, city, and league type; fixtures
you log, including venue and scheduled time; and match results.

#### 1.5 Engagement and ranking data

Notifications generated by your activity (follows, likes, comments), and — where the Leaderboard
feature is live — your points and rank. **[PROPOSAL, see Section 10]** This may include a public
ranking that shows your real display name, including if you are a minor.

#### 1.6 Moderation data

If a report is made against you, or if you make one, the report's content, including any
free-text description of the reason for the report. Reports are among the most sensitive records
Soccernity holds, because a report can contain an allegation about — or written by — a child.

#### 1.7 Data we do not collect

**Worth stating plainly, because it is a genuine strength of the current design (noted in the
project's own DPIA draft):** Soccernity does not currently use advertising identifiers, device
fingerprinting, third-party behavioural-advertising tracking, or a third-party analytics SDK.
We do not track your precise location. If this changes in future, this Policy will be updated
before it does, not after.

### 2. How we use your data

We use your data to: create and operate your account; show your content to other users as part
of the service (your feed, club page, Banter Room, or profile); operate the guardian-consent
process for minors' accounts; send you service emails (verification, password reset, guardian
consent, account status); review reports and take moderation action; calculate Leaderboard
rankings where that feature is live; and maintain the security of the platform.

**[PROPOSAL — not yet determined]** This Policy does not yet state a specific lawful basis (under
UK GDPR) for each of the purposes above — for example, whether core service delivery relies on
"performance of a contract" or "legitimate interests," and how that interacts with a guardian's
consent for a minor's account. Selecting a lawful basis is a legal determination for counsel, not
something this draft resolves. Counsel should also consider, and this draft does not assess,
whether any category of data collected (for example, an injury mentioned in a post, or an
inference drawn from club affiliation) could amount to special-category data under Article 9 UK
GDPR.

### 3. Restricted-pending accounts: what changes before and after guardian consent

A minor's account exists as soon as it is created, but is **restricted** until a guardian
confirms consent (see the Terms of Service, Section 3, and Build Plan Section 8.3). While
restricted:

- The account's profile is not visible to other users.
- The account cannot receive or send messages to/from unverified accounts.
- The account cannot post to Banter Rooms beyond read-only viewing, and — as currently
  implemented — cannot create feed posts or comments (Decision Log #21).
- The account does not appear in other users' followers/following lists (Decision Log #41), and
  does not appear on the public Leaderboard (Decision Log #45).

Once a guardian confirms consent, the account unlocks to its normal minor-safe default
permissions — still more restricted than an adult account's permissions, consistent with the
trust-and-safety approach in Log Book Section 10.1. **This restriction exists specifically so
that a minor's data is not collected or shown more broadly than necessary before a guardian has
had the chance to say no** — it fails closed rather than open.

### 4. The guardian-consent process, in data-protection terms

4.1. When a minor registers, we ask for their guardian's name, email, and relationship to the
minor, and send a single-use link to that email address. **[PROPOSAL]** That link currently
expires after 72 hours and can be regenerated from the minor's own account-status page.

4.2. When the guardian follows the link, they see a plain-language explanation of what the
minor's account can do and what data is collected, and an explicit "I consent" action. This
action is recorded, including the time it happened. **[PROPOSAL — flagged gap, carried from the
project's own DPIA draft]** We currently do not record *how* consent was given beyond the
timestamp — for example, the IP address, device, or the specific wording of the consent screen
shown at the time. If consent is ever challenged, Soccernity may need to be able to demonstrate
how it was obtained (UK GDPR Article 7(1) places that burden on us as the controller). Counsel
should specify the minimum additional record needed, bearing in mind that a fuller audit trail
is itself more personal data about the guardian, not an unambiguous "collect more" answer.

4.3. If a guardian's email address changes while consent is pending, submitting the new address
**restarts this process from scratch** — the old link is invalidated, the account (re)enters the
restricted-pending state, and a new link is sent to the new address (Decision Log #60).

4.4. **[OPEN — genuinely undecided, not resolved by this draft]** There is currently no in-product
way for a guardian to formally decline consent, or to withdraw consent once given, other than
using the account deletion process described in Section 8. Under UK GDPR, where consent is relied
upon as the lawful basis, withdrawal must be as easy as giving it — counsel should determine
whether Soccernity's current mechanism (deletion, which is a different and more drastic action
than withdrawal) satisfies that, and if not, what a dedicated withdrawal path should look like.

### 5. Who we share your data with

We do not sell your personal data. We share it with the following categories of recipient, each
acting on Soccernity's instructions as a data processor unless stated otherwise:

- **Postmark** — our email delivery provider, used to send verification, password-reset, and
  guardian-consent emails (Decision Log #17). A guardian-consent email necessarily includes the
  minor's display name and a single-use activation link.
- **[Cloud storage provider — S3-compatible, provider not yet finalised]** — used to store
  photos and videos you upload.
- **Sentry** — an error-monitoring tool, wired into the platform but not yet actively collecting
  data as of this draft (no live account exists). **[PROPOSAL, carried from the DPIA draft]**
  Before Sentry is switched on, we should configure it to avoid capturing request bodies or user
  identifiers from safety-sensitive endpoints (in particular, the guardian-consent flow), so
  that an error trace does not itself become a place where children's or guardians' data ends up
  in a third-party system.
- **Render, Neon, and Upstash** — our infrastructure providers, hosting the application, database,
  and caching layer respectively (Decision Log #26). Other users of the platform do not have
  direct access to this infrastructure.
- **Other Soccernity users**, to the extent you choose to share content publicly or the platform
  displays it as part of the service — for example, your posts, profile (once your account is
  active, not restricted-pending), and Leaderboard ranking. See Section 10.
- **Soccernity's own moderation staff**, where a report is made involving your account or content
  (Section 7 of the Terms of Service).
- **Law enforcement or regulators**, where we are legally required to disclose data, or where we
  believe in good faith it is necessary to protect the safety of a child or another user.

**[OPEN — Decision Log #9/#26 context]** We have not yet completed a full assessment of where
each of the providers above stores data, or whether that involves a transfer of personal data
across borders that would require additional safeguards under UK GDPR or Nigeria's NDPA 2023.
This is flagged as an open item for counsel, not assessed as low-risk by default.

**Not yet live:** Google, Apple, and Facebook sign-in is visible in the product's design but not
yet functionally connected (Decision Log #55). If and when it is enabled, this Policy will be
updated to describe what each provider shares with Soccernity when you use it to sign in.

### 6. Cookies and similar technologies

**[PROPOSAL — to be confirmed once the web application's actual cookie/storage use is audited]**
As of this draft, Soccernity's web application stores your session (login) tokens using the
browser's local storage, used solely to keep you signed in — not for advertising or cross-site
tracking. This section should be revisited and expanded once a formal cookie audit is done,
particularly if any analytics or advertising technology is added in future.

### 7. Public and semi-public visibility of your information

Some of what you do on Soccernity is visible to other users, or to the public, depending on the
feature. This is described here so it is not a surprise:

- **Posts, comments, and profile content** you choose to share are visible to other users
  (and, depending on the specific feature's own visibility rules, potentially to anyone) once
  your account is active — see Section 3 for what "active" excludes for a restricted-pending
  minor.
- **Club pages** show your membership to other members and, depending on the club page's own
  settings, more broadly.
- **The Leaderboard** — where this feature is live — shows real display names for all eligible
  users, **including minors**. This is a deliberate product decision, not an oversight: the
  platform's purpose is to give grassroots players visibility to scouts and clubs before formal
  scouting begins, and a pseudonymised or hidden minor would defeat that purpose for the users
  it is meant to help most (Decision Log #45). A restricted-pending minor is excluded from this
  data entirely, not shown pseudonymously, consistent with Section 3. **[PROPOSAL]** Counsel and
  the founder should consider whether this trade-off — real names for minors, in service of
  future scouting visibility, ahead of the Discover pillar this MVP does not yet build — needs
  its own dedicated review before the Leaderboard actually goes live, given it is one of the
  more consequential minors'-data decisions in the product.
- **Followers/following lists** are public by default for accounts that are not restricted-pending
  (Decision Log #31), a deliberate departure from how saved posts are treated (see below), because
  this data is standard on the platforms Soccernity is modelled after. **[PROPOSAL, flagged by
  the founder's own prior decision]** If Soccernity ever introduces a private-account setting,
  this default would need to be revisited.
- **Saved posts** are private — visible only to you, never to other users (a deliberate difference
  from followers/following).
- **Never shown publicly, regardless of account status:** your full date of birth, your guardian's
  contact details, your email address, your phone number, or the content of a report made about
  or by you.

### 8. Direct messages and Banter Rooms

Messages you send through Soccernity's direct-messaging feature are visible to the participants
in that conversation and to Soccernity's moderation staff where a report is made. Banter Room
posts follow the same visibility rules as other community content. **[OPEN — flagged, not
resolved]** The product does not currently have a rule, enforced at the data-model level,
restricting who may initiate a direct message with a minor's account beyond the restricted-pending
gate described in Section 3. Counsel should consider whether the current controls are sufficient
before messaging is more broadly relied upon as a core feature.

### 9. How long we keep your data

**Every period below is a starting proposal for counsel to confirm or revise — not final policy —
per the retention-policy skeleton in Build Plan Section 8.2, refined where the product has since
made a concrete decision (Decision Log #42, #44).**

| Data type | Retention period | What triggers deletion |
|---|---|---|
| Active account data (profile, content, guardian-consent record while the account is active) | For as long as your account remains active | Account deletion request (see below), or a defined review at the age of majority **[PROPOSAL, not yet built]** |
| **Account deletion — the 30-day grace period** | Your account and content are retained for **30 days** after you request deletion, in a `pending_deletion` state during which your account cannot be logged into but the request can, in principle, still be reconsidered | Automatic, scheduled deletion once the 30-day window elapses |
| **Account deletion — after the 30-day window** | Your `User` record, and content that depends on it, is then **permanently and irreversibly deleted** — a real deletion, not de-identification. Because of how the data model is connected, this also removes other users' comments, likes, and saved-post records **on content you posted**, even though it does not touch their own accounts or their own posts | Automatic, scheduled |
| **Guardian-consent records — the one deliberate exception** | Guardian/consent records are **not** deleted at the same time as the rest of your account. They are separately snapshotted (name, relationship, and whether/when consent was confirmed — not the full guardian record) and kept for a further **6 months** after the 30-day grace period ends (**~7 months total** from the original deletion request), specifically so Soccernity can demonstrate that valid guardian consent was obtained if it is ever challenged | Automatic, scheduled, on its own separate timer |
| Messages between users | **[PROPOSAL]** A rolling window (a starting figure only: 12 months), reviewable by policy | Automatic purge past the window, or your own deletion of the conversation/account |
| Moderation reports and actions | **[PROPOSAL]** Retained for longer than ordinary content, for accountability and pattern detection across repeated reports | Periodic review, not automatic deletion |
| Media you upload (photos/videos) | Tied to the lifecycle of the post or article it belongs to | Deleted when the parent content is deleted |

**On the account-deletion mechanism specifically, stated plainly because it is a genuine and
somewhat unusual data practice worth being direct about:** deleting your account does not simply
hide your data — after the 30-day window, it results in a real, hard deletion of your account
record, which cascades to remove your own posts, comments, likes, follows, saves, and
notifications, **and also removes other users' comments, likes, and saved-post records that were
made on your own posts** (because those records depend on the post existing). Soccernity's
position is that deleting an account should remove that person's full digital footprint from the
platform, framed as a safety measure that benefits everyone, including minors — not a partial
erasure that leaves fragments behind. The one deliberate exception is the guardian-consent
snapshot described above, kept specifically so Soccernity can prove consent was properly obtained,
for a further 6 months, and then deleted on its own separate timer. **[OPEN — Decision Log #4
cross-check]** Whether Nigeria's NDPA 2023 expects an identical retention window for consent
records as the UK-GDPR-derived reasoning above has not been separately confirmed by Nigerian
counsel and should not be assumed identical without that review.

**[OPEN — not yet decided]** There is currently no defined retention period for a minor's account
that never receives guardian consent at all (see Section 4.4) — it remains restricted-pending
indefinitely under the current implementation. Counsel and the founder should decide whether such
an account should eventually be deleted automatically, and if so, after what period.

### 10. Your rights

Depending on where you are, you have rights under **UK GDPR** and/or **Nigeria's NDPA 2023**.
Both regimes give you broadly similar rights, and Soccernity's own stated principle (Log Book
Section 10.1) is to apply the stricter of the two wherever they differ, rather than the weaker
one. These include the right to:

- **Access** the personal data we hold about you.
- **Correct** inaccurate or incomplete data.
- **Request deletion** of your data — the account-deletion process described in Section 9,
  Terms of Service Section 8.
- **Object** to certain processing, and **restrict** how we use your data in certain
  circumstances.
- **Receive a copy of your data** in a portable format (data portability), where applicable.
- **Not be subject to a decision based solely on automated processing** that produces a legal or
  similarly significant effect on you, without human involvement — **[PROPOSAL, for counsel to
  confirm]** Soccernity does not currently make any such automated decision about a user (the
  Leaderboard's ranking is a straightforward calculation, not an automated decision "about" a
  user in this legal sense, but counsel should confirm that reading).

**For a minor's account:** these rights are the minor's own rights, not automatically their
guardian's. **[OPEN — not resolved by this draft]** Who may exercise which right on behalf of a
minor, at what age, and how a disagreement between a minor and their guardian over exercising a
right (for example, the minor wants to keep the account and the guardian wants it deleted) would
be handled, is a genuine open question this draft does not have a view on and flags for counsel.

**To exercise any of these rights**, contact us at **support@soccernity.com**. **[PROPOSAL]**
We aim to respond within one month, consistent with UK GDPR's standard timeframe; counsel should
confirm this is also consistent with NDPA 2023's own requirements.

**You also have the right to complain to a data protection regulator** — in the UK, the
Information Commissioner's Office (ICO); in Nigeria, the Nigeria Data Protection Commission
(NDPC). **[OPEN — Decision Log #4]** Which regulator(s) have jurisdiction over a specific
complaint depends on the still-open jurisdictional-scope question; this Policy names both
regulators because Soccernity's Phase 1 launch spans both markets, not because that question is
resolved.

### 11. Security

We take reasonable technical and organisational measures to protect your data, including secure
password storage (passwords are never stored in plain text) and access controls on our
moderation and administration tools. **[OPEN — flagged, not assessed]** No specific
encryption-at-rest commitment or breach-notification procedure (including whether a breach
affecting a minor's data triggers notification to their guardian, not only to the affected user)
has been finalised as of this draft; this depends in part on the still-developing hosting setup
(Decision Log #26) and is an open item for counsel.

### 12. Children's privacy — summary

Soccernity is built with the expectation that a meaningful share of its users are children, not
as an edge case bolted onto an adult product (Log Book Section 10.1). Sections 3 and 4 above
describe the guardian-consent mechanism in full; this section exists only to point you to them,
because it is the single most important part of this Policy for anyone assessing whether the
product is safe for a child to use.

### 13. Third parties depicted in content you didn't create

Grassroots football photography routinely captures people — including children — who are not
Soccernity users and have not agreed to anything in this Policy. **[OPEN — flagged, not
resolved]** There is currently no reporting route in the product for someone who is not a
registered user to ask for a photo of themselves or their child to be removed (see the Terms of
Service, Section 7.4). If you believe an image or video of you or your child has been posted
without an appropriate basis, please email **support@soccernity.com** and we will review it
manually while a proper in-product route is built.

### 14. Changes to this Policy

We may update this Policy from time to time. If a change materially affects how we process a
minor's data or the guardian-consent process, we will make reasonable efforts to notify affected
guardians, not only publish a changed date at the top of this page.

### 15. Contact us

Questions about this Policy, or requests to exercise your data rights, can be sent to
**support@soccernity.com**.

---

## PART C — Open items this draft deliberately does not resolve

Restated in one place, in the same spirit as the DPIA draft's own Section 5, so nothing here is
mistaken for settled by the time this reaches counsel or gets converted into Figma/code.

| # | Item | Where it appears above | Owner |
|---|---|---|---|
| 1 | **Decision Log #4** — jurisdictional scope beyond UK GDPR + NDPA 2023 | Throughout; ToS §12, PP intro & §10 | Founder + counsel |
| 2 | Soccernity's legal entity name, registration, and registered address | ToS & PP headers | Founder |
| 3 | Lawful basis for each processing purpose under UK GDPR | PP §2 | Counsel |
| 4 | Whether any special-category (Article 9) data is processed | PP §2 | Counsel |
| 5 | No guardian decline/withdrawal path exists in-product | ToS §3.4; PP §4.4 | Founder + `backend-api` |
| 6 | Consent audit trail records timestamp only, not method | PP §4.2 | Counsel |
| 7 | No retention rule for an account stuck in restricted-pending indefinitely | ToS §3.4; PP §9 | Founder + counsel |
| 8 | No non-user reporting route for content depicting non-users | ToS §7.4; PP §13 | Product + counsel |
| 9 | Cross-border data-location/transfer assessment for Postmark/S3/Sentry/Render/Neon/Upstash | PP §5 | Counsel |
| 10 | Whether Leaderboard's real-names-for-minors decision needs its own dedicated safeguarding review before launch | PP §7 | Founder + counsel |
| 11 | Encryption-at-rest and breach-notification commitments, including guardian notification | PP §11 | Counsel |
| 12 | Who exercises a minor's data-subject rights, and how a minor/guardian disagreement is handled | PP §10 | Counsel |
| 13 | Governing law and jurisdiction for disputes | ToS §12 | Counsel |
| 14 | NDPA 2023 cross-check on the 6-month consent-record retention window (UK-GDPR-derived reasoning, not yet confirmed for Nigeria) | PP §9 | Nigerian counsel |
| 15 | Cookie/local-storage audit for the actual web application | PP §6 | `backend-api`/frontend + counsel |

---

## Sign-off

*Neither the Terms of Service nor the Privacy Policy above is in force. Neither has any status
until every line below is completed by a qualified person. An incomplete sign-off block means
both documents remain drafts, regardless of how finished the rest of this file looks.*

**Confirmation required at sign-off:**

- [ ] Decision Log #4 (jurisdictional scope) has been reviewed by counsel and this document
      reflects the outcome
- [ ] Soccernity's legal entity name, registration, and registered address have been supplied
      and inserted
- [ ] A lawful basis has been determined for each processing purpose in the Privacy Policy
- [ ] Every **[PROPOSAL]** above has been accepted, revised, or rejected — none left undecided
- [ ] Every **[OPEN]** item in Part C has been addressed or explicitly accepted as a launch risk
      by the founder
- [ ] The retention table in Privacy Policy Section 9 has been confirmed against actual counsel
      advice, not left as this draft's own reasoning
- [ ] Governing law and jurisdiction (Terms of Service Section 12) has been determined
- [ ] Both documents have been checked against whatever Section 8.1 DPIA counsel ultimately signs
      off, so the two are consistent with each other

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

## Closing statement

**This document is a draft for counsel review and nothing more.** It is not a finished Terms of
Service, it is not a finished Privacy Policy, it is not legal advice, and it does not assert that
either document is compliant with UK GDPR, Nigeria's NDPA 2023, or any other regime. It was
produced by an automated agent working from the project's own Build Plan, Log Book, and Decision
Log, cross-checked against `CLAUDE.md`'s record of what is actually built as of Sprint 2 — not
from a generic template.

Per `CLAUDE.md` non-negotiable #2, no output of the `safeguarding-drafter` agent may be treated
as approved. If anyone proposes publishing either document, converting these Figma frames to
live code, or removing the **[PROPOSAL]**/**[OPEN]** markers above on the strength of this draft
alone, or asks to skip counsel review to unblock `figma-to-code` faster: the answer is no. This
is one of the few places in this project where a shortcut carries real legal and child-safety
consequences, and the cost of getting it wrong is borne by the children this platform is built to
serve.
