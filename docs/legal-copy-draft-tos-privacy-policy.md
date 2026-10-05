# Soccernity — Draft Legal Copy: Terms of Service & Privacy Policy

## DRAFT (v0.7) — POST-SIGN-OFF REWRITE — NOT APPROVED AS LIVE COPY, NOT LEGAL ADVICE

**Status: draft output of the `safeguarding-drafter` workflow (`CLAUDE.md` non-negotiable #2). It is
not approved, not in force, and not ready to publish.**

What changed at v0.7: counsel and the founder have now worked through all 82 review comments on
the previous draft, counsel has approved **with amendments**, and the checklist in the sign-off
block has been completed. **That sign-off covers the *decisions* those comments resolved. It does
not cover this prose, which is the first rewrite that applies them** — nobody has yet read v0.7 and
confirmed the wording says what was decided. Treat it accordingly. This document is not a statement
that either policy is legally sufficient or compliant with any regime.

Two placeholders are **deliberately left unfilled**, not drafting gaps:

- **The legal entity name, registration number and registered address** — genuinely pending
  re-registration (founder's own comment on the reviewed draft). Appears in both documents.
- **The Effective Date** — to be set when the documents are published.

Do not fill either from this file. The sign-off block at the end of this document is unchanged.

- **Document:** Draft Terms of Service and Privacy Policy for Decision Log #203 (Build Plan
  Section 9). Decision Log #4 (jurisdictional scope) is also resolved by the sign-off.
- **Grounded in:** Build Plan Sections 3, 8 and 9; Log Book Section 10; the DPIA draft
  (`docs/sprint-1-dpia-outline-draft.md`); and the merged code on `main` as of 2026-10-05 (checked
  against `services/api`, not recalled from earlier drafts).
- **Version:** 0.7 (draft — still NOT APPROVED). Earlier versions: v0.1 drafted 2026-09-05; v0.2 applied counsel's
  09/09/2026 review; v0.3–v0.6 (2026-09-20 to 2026-09-22) added the under-16 tier, adult-to-minor
  messaging block, consent audit evidence, age reclassification and card verification. Their
  per-version changelogs are superseded by this one and live in git history.

### v0.7 changelog

**A. Resolved decisions applied (the `[PROPOSAL]`/`[OPEN]` markers they covered are removed):**

1. **Scope** — UK, Nigeria, **US and EU**. No EU or other representative required. ToS §12 and the
   Privacy Policy scope note rewritten; Privacy Policy §10 rights/regulators extended.
2. **COPPA** — card verification is the stated control; nothing further unless a regulator requires
   it (ToS §3.7, PP §4.6).
3. **Guardian link window** — 72 hours, stated as final (ToS §3.1, §3.4; PP §4.1, §4.4).
4. **Guardian email change** — the **user**, not the guardian, changes it while consent is pending
   (ToS §3.3, PP §4.3).
5. **Adult-to-minor DM block** — worded as applying to **16–17s with guardian consent confirmed**
   (ToS §3.5, PP §8), with a short who-can-message-whom summary added so it cannot be read against
   the general messaging rules.
6. **Guardian contact** — shown on the under-16's own profile card, **visible to any viewer**,
   labelled "Guardian contact", because an under-16 cannot send or receive messages (ToS §3.5(a), PP
   §1.2, §7, §8).
7. **Display names** — username first, display name as fallback, for every user including minors
   and for Discover (ToS §9.1; PP §1.1, §1.5, §7).
8. **Governing law** — England & Wales, exclusive jurisdiction, savings clause for non-excludable
   statutory rights; all data-protection language removed from it (ToS §12).
9. **Lawful basis** — contractual necessity + legitimate interests as the core; consent only where
   law requires it or for optional features; guardian consent layered on top (PP §2).
10. **Retention** — guardian data after the user turns 18; 6–7 years for data tied to a concluded
    investigation or moderation case; age-reclassification log follows minor-data rules until
    promotion to adult, then adult rules (PP §9).
11. **Special-category data** — the resolved clause is inserted verbatim in PP §2.

**B. Staleness fixed against `main` (not part of the 82 comments):**

- **Under-16 messaging refusal** is now the same indistinguishable 404 as every other blocked
  recipient (Decision Log #351, live in `messaging.service.ts`). The v0.3–v0.6 text describing a
  distinct "cannot receive direct messages" refusal, and Part C rows 16/25, were wrong and are
  corrected.
- **Deleting a post** now permanently deletes it, including other users' comments, likes and saves
  on it (Decision Log #360); v0.6 said it was "removed from public view" (ToS §6.3, PP §9). Post
  authors can also hide comments or restrict who may comment (ToS §6.4).
- **Storage provider** is Cloudflare R2 (Decision Log #307), not "not yet finalised" (PP §5).
- **Payment provider** for card verification (Stripe) is now listed as a processor (PP §5).
- **Anonymous page-view counting** exists (`PageView`); disclosed in PP §1.7 so "we do not use
  analytics" is not misread.
- **Leaderboard/Contest** wording no longer says they are wholly unbuilt (ToS §9.2).
- Restricted-pending wording in ToS §3.2 / PP §3 now matches the code (cannot send direct messages
  and cannot be found as a recipient) rather than the looser "unverified accounts".
- Retired the superseded v0.3–v0.6 changelogs (history is in git).

**C. Left alone on purpose:** the entity placeholder, the Effective Date, the sign-off block, the
counsel-approved §10.3 warranty wording, and every `[PROPOSAL]`/`[OPEN]` marker that no resolved
decision covered. Where the product does **not yet match** the resolved decision (guardian contact
visibility, usernames, the user-initiated guardian-email change), the policy text states the decision
and **Part C rows 32–34 flag the gap** — do not publish until each is built or the text is adjusted.
**Out of scope here:** a pre-publication sensitive-content screen (Russmedia, CJEU) was identified
during review; it is a separate product/engineering gap, tracked as its own Decision Log entry in a
companion PR, and is not part of closing #203.

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
operates a 30-day-grace-then-anonymize account-deletion policy cannot honestly say all
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

2.1. You must be at least **5 years old** to create a Soccernity account at all (Decision Log
#19 — confirmed, not a proposal). Soccernity will not create an account, under any
circumstances, for anyone who declares an age below this floor.

2.2. If you are under 18, Soccernity requires the involvement of a parent or legal guardian
before your account has full access to the platform. This applies to the full under-18 age band,
not only the narrower age at which UK GDPR Article 8 itself would require it — a deliberate,
considered safety decision, not an over-reading of the law (Decision Log #8), because Soccernity
is a platform where unaffiliated adults and organisations may eventually seek to contact
grassroots players. Full detail on how this works is in Section 3.

2.3. Age declaration works in three steps when you sign up: (1) you enter your date of birth;
(2) you affirm that the date of birth you entered is accurate; and (3) you are shown a warning
that providing a false date of birth — including to bypass the age floor in 2.1 or the
guardian-consent requirement in 2.2 — is a breach of these Terms and may result in immediate
account suspension. Soccernity relies on this declaration; it does not verify your age against
identity documents.

2.4. **Guardians.** If you are acting as a guardian confirming consent for a minor's account, by
confirming consent you agree that you are that minor's parent or legal guardian (or otherwise
hold parental responsibility recognised under applicable law), and that you consent to the
processing described in the Privacy Policy on the minor's behalf, on the terms described there.

### 3. Minors' accounts and the guardian-consent process

3.1. When someone under 18 registers, Soccernity captures the name, email address, and
relationship of a parent or guardian before the account is created, and sends that guardian a
single-use consent link by email. **That link expires after 72 hours** and can be re-sent from the
account's own status page if it lapses.

3.2. Until a guardian confirms consent, the minor's account exists but is **restricted**. A
restricted-pending account cannot: have a publicly visible profile; send direct messages, or be
found as a recipient by anyone trying to message it; participate in Banter Rooms beyond read-only viewing; or, as
currently implemented, create posts or comments (Build Plan Section 8.3 step 5; Decision Log
#21 for the current scope of what "restricted" covers). A restricted-pending minor also does not
appear in another user's followers/following lists (Decision Log #41), and does not appear in
Leaderboard rankings (Decision Log #45) — see the Privacy Policy for what changes once consent
is confirmed.

3.3. While consent is pending, **the minor (the account holder) — not the guardian — can change
the guardian's email address on file.** The guardian has no way to do this themselves. Changing it
**restarts the consent process from scratch**: the previous consent link stops working, the
account remains (or returns to) restricted-pending, and a new single-use link is sent to the new
address (Decision Log #60). This is deliberate — a recorded or pending consent is tied to a
specific person at a specific address, and changing the address without restarting the process
would mean the record no longer reflects who was actually asked.

3.4. **A guardian can refuse or withdraw consent, and an unanswered request does not stay open
forever.** There are three ways a minor's consent arrangement ends in refusal:

- **Explicit decline.** While a request is pending, the guardian can decline it from the consent
  link they were sent.
- **Guardian-initiated withdrawal.** After giving consent, a guardian can withdraw it. They
  request a fresh, single-use withdrawal link, which is emailed to the guardian, and follow it to
  confirm.
- **Implicit decline by non-response.** If the guardian does not respond, we automatically
  re-send the request once when the first 72-hour window lapses, and warn the minor that a second
  lapse will close the account. If the second 72-hour window also passes with no response (about
  144 hours in total), the request is treated as declined.

All three paths lead to the same outcome: the minor's account is closed to further use and
enters the same 30-day account-deletion process described in Section 8 — nothing is decided
differently depending on which path was taken. This also means a minor's account can no longer sit
restricted-pending indefinitely with no resolution.

3.5. **Extra limits for accounts under 16, and a rule about adults contacting minors.**

(a) *Under 16.* In addition to guardian consent, an account belonging to someone under 16 has
further limits, **even after a guardian has confirmed consent**: (i) direct messaging is not
available — the account can neither send nor receive direct messages; (ii) Bants (Banter Rooms) are
not available, including reading them; and (iii) Community Groups are read-only in the sense that
the account can view groups and can join or leave them, but cannot create one. Because an
under-16 account can neither send nor receive direct messages, the account's profile card shows
the guardian's email address, labelled **"Guardian contact"**, to **any viewer of that profile**:
it is the only route by which anyone who needs to reach the child can do so. These limits apply
in addition to, not instead of, the guardian-consent requirement in 3.1–3.4 (an under-16 whose
guardian has consented is still under-16). We may show a message that a feature is unavailable
without saying why.

(b) *Adults contacting minors.* This rule concerns **16- and 17-year-olds whose guardian has
confirmed consent** — the only minors who can use direct messaging at all (a restricted-pending
account cannot be messaged, and an under-16 account can neither send nor receive messages: see (a)
and Section 3.2). An adult account cannot start a new direct-message conversation with such a
minor. It sits alongside, and does not change, the messaging limits above. Where that is attempted, the response is the same "user not found" response a
person would get for an account that does not exist or cannot be messaged, so that the response does
not reveal a minor's account. This rule applies to starting a conversation only: it does not end a
conversation a minor started, and a minor may message an adult. See Privacy Policy
Section 8 for the limits of this protection, stated honestly.

3.6. **Your age status is recalculated automatically.** Soccernity re-checks, once a day, whether
each account is under 18 and under 16, using the date of birth on the account (which we do not
verify against identity documents — see 2.3). When an account passes 16, the under-16 limits in
3.5(a) lift and we send an in-app notification. When an account passes 18, guardian consent stops
applying, the account becomes an adult account, and we email the guardian on file to tell them; the
email asks the guardian to do nothing. Because the check runs daily, **an account can stay
under its old classification for up to about 24 hours after a birthday**; we accept and disclose
that delay. If the date of birth on an account is later corrected so that the account would be
younger, the stricter classification is re-applied at the next daily check and no notification is
sent; we log these cases for manual review.

3.7. **Extra verification for younger children in the United States.** Where an account is
registered with a date of birth showing the child is **under 13**, and the country selected at
sign-up is the **United States or was not given**, the guardian is asked to complete one further
step **in addition to** the emailed consent link in 3.1: a small card payment. This step is our
parental-verification control for this group under United States children's-privacy rules (COPPA).
It exists because an email link alone shows only that someone with access to that inbox clicked
it; a card payment is a way of checking the person is an adult with a payment card, and is one of
the verification methods those rules describe. It does not replace the
email link — consent is not recorded until **both** are done. The payment is a small amount
(currently 50 US cents, subject to change) taken by our payment provider, and **is refunded
automatically as soon as the check succeeds**; if a refund does not go through first time, we retry
it. Soccernity does not receive or store the guardian's card details (they go directly to the
payment provider); we keep only a reference to the transaction. Guardians of children who are 13 or
over, or whose selected country is not the United States, are not asked for this step. The country
is what the person **tells us**; we do not check it. We will add further verification steps
only if a regulator requires them.

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

6.3. If you delete one of your posts, it is **permanently deleted**, together with every comment,
like and save other users have made on it (Decision Log #360). If you delete a comment, it is
removed. If you delete your account,
Section 8 explains what happens to your content: it is not removed, but stays visible without
your identity attached, because other users' replies, likes, and saves on it are not yours to
take down with you.

6.4. As the author of a post you can restrict who may comment on it (everyone, only people who
follow you, or no one) and hide individual comments on it. A hidden comment stays visible to you
and to the person who wrote it, is flagged as hidden, and is not counted in the post's comment
total.

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

7.4. You may report content or behaviour that violates these Terms using the reporting tools
provided.

### 8. Ending your account

8.1. You can deactivate your account at any time (a reversible pause — your data is retained and
you can sign back in to reactivate), or request deletion, from your account settings. Both
actions require you to re-enter your password as confirmation, and both immediately sign out
every other active session on your account.

8.2. Requesting deletion does not delete your account immediately. Your account enters a 30-day
grace period, during which you cannot log in. The request is not currently reversible through the
product once made. **[PROPOSAL — see the Privacy Policy, Section 9, for the full retention
detail]**

8.3. **What happens after the 30-day grace period.** Your account record is **anonymized in
place; it is never hard-deleted.** Your email address, phone number, date of birth, and club
affiliation are cleared, your display name is replaced with "[deleted user]," your password is
made unusable, and the account is marked permanently deleted. Specifically:

- **Content you posted is not deleted.** Your posts, comments, messages, and match results stay
  visible, attributed to "[deleted user]," because other users' replies, likes, and saves on that
  content are not yours to take down with you.
- **Signals that are yours alone are removed:** your follows, likes, saves, notifications, and
  your memberships of groups, Banter Rooms, and club pages.
- **If you organised a Grassroots team, the team survives — deliberately.** It goes dormant and
  stays visible read-only, and can later be reassigned to a new user who registers the same team
  name and city.
- **Guardian-consent records** are handled separately; see the Privacy Policy, Section 9.

8.4. **Investigation hold — a genuine exception to the 30-day timer.** If you are the reporter,
the reported party, or the author of reported content in a moderation report that has not yet
been resolved, anonymization is **held entirely**. Your account stays fully identifiable to
moderators until the investigation concludes. Preserving evidence takes priority over the
ordinary 30-day timer. During the hold you still cannot log in.

8.5. **Minors.** A guardian's request to delete a minor's account supersedes the minor's own
wishes. A minor cannot independently consent to keep, or to delete, their own account against
their guardian's decision.

8.6. Soccernity may suspend or terminate your account for a breach of these Terms, in particular
a breach of Section 5, or where we reasonably believe an account was created in breach of the
age or guardian-consent requirements in Sections 2–3.

### 9. Club pages, the Leaderboard, and public visibility

9.1. Some information about you is visible to other users by default once your account is fully
active (not restricted-pending): your username (or, if you have not set one, your display name),
profile content you choose to share, your
posts and comments, your club-page membership, and — where the Leaderboard feature is live —
your ranking and points. **This applies to minors as well as adults**: Soccernity's product
decision is to show your username — or, where you have not set one, your display name — on the
Leaderboard and in Discover for all eligible users, including minors, with no pseudonym option,
because the platform's purpose is to give grassroots players visibility to scouts and
clubs (Decision Log #45); a restricted-pending minor is simply absent from this data until
consent is confirmed, not shown under a pseudonym. See the Privacy Policy, Section 10, for the
full detail and for what is deliberately kept private even once an account is active (for
example, a minor's exact date of birth and any un-shared contact details).

9.2. The Leaderboard, Contest, and Competition features described above are being rolled out in
stages and are not all live in every part of the product yet; this document describes the intended
design so that the real data practice, not only what is in production on any given day, is
disclosed.

### 10. Disclaimers

10.1. Soccernity is provided "as is." We do not guarantee the service will be uninterrupted,
error-free, or available at all times.

10.2. Live scores, fixtures, and news content are sourced, in part, from third-party sports-data
providers (our current sports-data provider is Highlightly — Decision Log #6, resolved); we do
not guarantee the accuracy or timeliness of that content.

10.3. You agree that all information you submit is truthful and that you will not misuse, manipulate, or interfere with the service. **[PROPOSAL — standard limitation-of-liability language; drafted deliberately narrow here because a platform serving minors should not use broad liability waivers to avoid safeguarding responsibilities.]** To the fullest extent permitted by law, Soccernity is not liable for indirect or consequential loss, harm, or consequences arising from your use of the service and or inaccurate information provided by you or from your use of the app in a manner that violates these Terms. Nothing in these Terms limits liability that cannot lawfully be limited, including for death or personal injury caused by negligence, or for any failure to meet our safeguarding obligations to minors using the platform. Your continued use of the Soccernity signifies your acceptance of these conditions and your responsibility to use the platform lawfully and appropriately.

### 11. Changes to these Terms

We may update these Terms from time to time. If a change materially affects your rights, or
affects a minor's account or the guardian-consent process, we will make reasonable efforts to
notify you (and, for a minor's account, the linked guardian) before the change takes effect.

### 12. Governing law

These Terms, and any dispute or claim arising out of or in connection with them or their subject
matter (including non-contractual disputes or claims), are governed by the laws of England and
Wales. The courts of England and Wales have exclusive jurisdiction to settle any such dispute or
claim. Nothing in this section limits any right you have under mandatory law that cannot be
excluded by agreement, including any consumer or statutory right you hold in the country where you
live.

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

**A note on scope:** this Policy applies to users in the United Kingdom, Nigeria, the United States
and the European Union. It is written against UK GDPR, Nigeria's NDPA 2023, EU GDPR and, for
children under 13 in the United States, COPPA (children's online privacy law). We are not required
to appoint a representative in the European Union or anywhere else. For younger children in the
United States, our verification control is the card-verification step described in Section 4.6; we
will add further steps only if a regulator requires them.

### 1. The data we collect

#### 1.1 Account and identity data (all users)

Email address, phone number (optional), password (stored as a secure hash, never in plain text),
username (optional — if you do not set one, your display name is shown in its place), display name,
date of birth, and — derived from date of birth — whether your account is
classified as belonging to a minor (under 18) and whether it is under 16. These two
classifications are recalculated daily from your date of birth (Section 4.5), and each change is
recorded in an audit log that keeps your account ID, the classification that changed, and your age
at that moment — **not** your date of birth. We store your full date of birth and use it, rather than an age band, because we need the exact date
to recalculate your under-18 / under-16 status every day (Section 4.5). It is **encrypted at rest, not
hashed**: a hash is one-way and could not be used for that recalculation.

#### 1.2 Guardian data (minors' accounts only)

If you are under 18, we also collect your parent or guardian's name, email address, and their
relationship to you, in order to run the guardian-consent process described in Section 4.
Guardians are themselves data subjects with respect to this information — it is processed only
in connection with the consent flow, and is subject to the retention rules in Section 9. If the
minor's account is under 16, the guardian's email address is also shown on that minor's profile
card, labelled "Guardian contact", to any viewer of the profile (see Sections 7 and 8).

#### 1.3 Content you create

Posts, comments, photos, videos, and other media you upload; your membership in club pages,
Banter Rooms, and community groups; who you follow and who follows you; posts you save; and
messages you send through the platform's direct-messaging feature.

#### 1.4 Grassroots record-keeping data

If you create or manage a grassroots team page, the team name, city, and league type; fixtures
you log, including venue and scheduled time; and match results.

#### 1.5 Engagement and ranking data

Notifications generated by your activity (follows, likes, comments), and, where relevant, an
in-app notice when your account passes an age milestone (currently, turning 16), and — where the Leaderboard
feature is live — your points and rank. **[PROPOSAL, see Section 10]** This may include a public
ranking that shows your username (or, if you have not set one, your display name), including if
you are a minor.

#### 1.6 Moderation data

If a report is made against you, or if you make one, the report's content, including any
free-text description of the reason for the report. Reports are among the most sensitive records
Soccernity holds, because a report can contain an allegation about — or written by — a child.

#### 1.7 Data we do not collect

**Worth stating plainly, because it is a genuine strength of the current design (noted in the
project's own DPIA draft):** Soccernity does not currently use advertising identifiers, device
fingerprinting, third-party behavioural-advertising tracking, or a third-party analytics SDK.
We do not track your precise location. We do count visits to the service in aggregate (for example,
how many requests a given page of the service received in a month); that count stores no user
identifier, IP address, session identifier or browser string, and cannot be linked to you. If this changes in future, this Policy will be updated
before it does, not after.

### 2. How we use your data

We use your data to: create and operate your account; show your content to other users as part
of the service (your feed, club page, Banter Room, or profile); operate the guardian-consent
process for minors' accounts; send you service emails (verification, password reset, guardian
consent, account status); review reports and take moderation action; calculate Leaderboard
rankings where that feature is live; and maintain the security of the platform.

**Lawful basis.** Our core lawful bases are **contractual necessity** (providing the account and
service you signed up for) and **legitimate interests** (operating, securing and improving the
service, moderation and fraud prevention, each supported by a documented balancing test). We rely on
**consent** only where the law requires it or for optional features. For minors, **guardian consent
is layered on top** of those bases wherever age, location or law requires it; it is an additional
safeguard rather than the sole basis. Regulatory or safeguarding escalations rely on **legal
obligation**.

**Special-category data.** Soccernity does not request, require, or intentionally collect special
category data (data revealing racial or ethnic origin, political opinions, religious or
philosophical beliefs, trade union membership, genetic or biometric data, health data, or data
concerning sex life or sexual orientation). Where a user voluntarily discloses such information in
public content they choose to post, that disclosure is covered under the lawful basis that the data
was manifestly made public by the data subject. We do not use such incidentally-disclosed
information to profile users, target them, or make decisions about them.

### 3. Restricted-pending accounts: what changes before and after guardian consent

A minor's account exists as soon as it is created, but is **restricted** until a guardian
confirms consent (see the Terms of Service, Section 3, and Build Plan Section 8.3). While
restricted:

- The account's profile is not visible to other users.
- The account cannot send direct messages and cannot be found as a recipient by anyone trying to
  message it.
- The account cannot post to Banter Rooms beyond read-only viewing, and — as currently
  implemented — cannot create feed posts or comments (Decision Log #21).
- The account does not appear in other users' followers/following lists (Decision Log #41), and
  does not appear on the public Leaderboard (Decision Log #45).

Once a guardian confirms consent, the account unlocks to its normal minor-safe default
permissions — still more restricted than an adult account's permissions, consistent with the
trust-and-safety approach in Log Book Section 10.1. **This restriction exists specifically so
that a minor's data is not collected or shown more broadly than necessary before a guardian has
had the chance to say no** — it fails closed rather than open.

Separately, accounts **under 16** carry additional limits that continue after consent is confirmed
(no direct messaging in either direction, no Bants, no creating Community Groups). These are a
distinct tier layered on top of guardian consent and are described in Section 8 and the Terms of
Service, Section 3.5.

### 4. The guardian-consent process, in data-protection terms

4.1. When a minor registers, we ask for their guardian's name, email, and relationship to the
minor, and send a single-use link to that email address. That link expires after 72 hours and can be regenerated from the minor's own account-status page.

4.2. When the guardian follows the link, they see a plain-language explanation of what the
minor's account can do and what data is collected, and an explicit "I consent" action. This
action is recorded, including the method and the time it happened. **The consent record also
captures the version of the consent screen the guardian was shown and a coarse device type
("mobile", "desktop" or "unknown")** (Decision Log #348). This record does **not** include the
guardian's browser string or IP address; the device type is derived at the moment of
confirmation and only the three-value category is kept. This is deliberately minimal: a fuller
audit trail is itself more personal data about the guardian. We record this so we can demonstrate
how consent was obtained if it is ever challenged (UK GDPR Article 7(1)). **[OPEN — limits, stated
honestly]** The screen version is a label that a person updates by hand when the screen's wording
changes materially; an automated check prompts them to, but the label is not itself proof of what
the guardian saw. Records confirmed before this was introduced carry neither field and are not
backfilled. The snapshot kept after account deletion (Section 9) includes both fields where present.

4.3. While consent is pending, the **minor (the account holder), not the guardian,** can change the
guardian's email address on file; the guardian has no access to do so. Submitting the new address
**restarts this process from scratch** — the old link is invalidated, the account (re)enters the
restricted-pending state, and a new link is sent to the new address (Decision Log #60).

4.4. **Declining and withdrawing consent.** A guardian can formally decline a pending request,
and can withdraw consent already given, in the product (see Terms of Service, Section 3.4). There
are three paths: (a) an explicit decline from the consent link; (b) guardian-initiated withdrawal
through a fresh single-use link emailed to the guardian; and (c) an implicit decline if two
consecutive 72-hour response windows (about 144 hours in total, with one automatic re-send at the
end of the first) pass unanswered. All three converge on the same account-deletion process
described in Section 9. A minor's account therefore cannot remain restricted-pending indefinitely
with no resolution. Withdrawal is as easy as giving consent: a single-use link and one
confirmation.

4.5. **When a minor turns 16 or 18.** A daily job recalculates whether each account is under 18 and
under 16 from its date of birth (Decision Log #349). The change takes effect immediately for the
account's next request, including on a session that is already signed in. When an account turns
**16**, the under-16 limits lift and the user gets an in-app notification ("Your account now has
access to more of Soccernity"). When an account turns **18**, guardian consent stops gating the
account, and the guardian on file receives one informational email that asks nothing of them. The
guardian's record is **kept**, not deleted, as consent history, and a consent request that was
still pending at 18 is left inert rather than being allowed to auto-decline an adult into deletion.
**[OPEN — disclosed limitations]** (a) Because the job runs daily, an account can keep its old
classification for up to about 24 hours after a birthday; we accept this. (b) Reclassification
relies on the declared date of birth, which we do not verify. (c) If a date of birth is later
corrected so an account becomes *younger*, the stricter classification is re-applied, no
notification is sent, and the case is flagged for manual review. (d) Each change is written to an
append-only log (account ID, which classification, before/after, age at that moment) that is kept
after the account itself is anonymised, and **has no retention period set** (Part C).

4.6. **Extra card verification for younger children in the United States.** For an account
registered with a date of birth under 13 and a self-selected country of the United States (or no
country given), the guardian must also complete a card-payment check before consent is recorded, on
top of the emailed link in 4.1–4.2. It exists because a clicked email link shows only inbox access;
a card transaction is a method United States children's-privacy rules recognise for confirming the
person is an adult. **What is collected and kept:** the country the person selected (used only to
decide whether this step applies, and not verified); a reference to the payment-provider
transaction; whether the check passed and when; whether the refund completed; and, in the consent
record, which method was used (email link, or email link plus card charge) and when. **What is not
collected:** card numbers or other card details — they are entered into the payment provider's own
form and never reach or are logged by Soccernity. **The refund:** the charge is small (currently 50
US cents) and is refunded automatically once the check succeeds; an hourly job retries any refund
that did not complete. After the account is anonymised (Section 9), the consent-record snapshot keeps
the verification method and time, but **not** the transaction reference or the country. The payment
provider (Section 5) is a further processor of the guardian's payment data. The country is what the
guardian selects; we do not verify it. This card step is our COPPA verification control for this
group; we will add further steps only if a regulator requires them.

### 5. Who we share your data with

We do not sell your personal data. We share it with the following categories of recipient, each
acting on Soccernity's instructions as a data processor unless stated otherwise:

- **Postmark** — our email delivery provider, used to send verification, password-reset, and
  guardian-consent emails (Decision Log #17). A guardian-consent email necessarily includes the
  minor's display name and a single-use activation link.
- **Cloudflare (R2 object storage)** — used to store photos and videos you upload (Decision Log
  #307).
- **Stripe** — payment provider, used only for the guardian card-verification step in Section 4.6
  for the younger-child US group. Card details go directly to Stripe and never reach Soccernity.
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
- **The Leaderboard, scouting, and Discover visibility** — where these features are live — show
  each eligible user's username or, where none is set, their display name (the same convention
  everywhere), **including minors**, deliberately, with **no pseudonym option**. This is a product decision, not an oversight: the
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
  or by you. (One deliberate, limited exception to the guardian-contact point: for an account
under 16, the guardian's email address is shown on that minor's profile card, labelled "Guardian
contact", to **any viewer of that profile**. We do this because an under-16 cannot send or receive
messages, so this is the only route by which anyone can reach them. It does not appear in lists,
rosters or feeds, and no other guardian detail — name, relationship — is shown.)

### 8. Direct messages and Banter Rooms

Messages you send through Soccernity's direct-messaging feature are visible to the participants
in that conversation and to Soccernity's moderation staff where a report is made. Banter Room
posts follow the same visibility rules as other community content.

**Who can message whom — summary.** A restricted-pending minor cannot send messages and cannot be
found as a recipient. An account under 16 can neither send nor receive direct messages, even after
guardian consent. A 16- or 17-year-old whose guardian has confirmed consent can message and be
messaged, subject to the rule below. Adults can message adults. The rules below are layers on this
summary, not exceptions to it.

**Under-16 accounts.** An account under 16 cannot send or receive direct messages, cannot use
Bants at all (reading included), and can view, join and leave Community Groups but not create
them. These limits apply even after a guardian has confirmed consent (Decision Log #346). The
account's profile card shows a "Guardian contact" line with the guardian's email, visible to any
viewer of that profile, because this is the only route by which anyone can reach the child. When
someone tries to message an under-16, they receive the same "user not found" response as for a
non-existent account, so the response does not reveal that the account exists (Decision Log #351).

**Adults cannot start a conversation with a 16–17-year-old.** This rule concerns 16- and
17-year-olds whose guardian consent is confirmed (the only minors who can use direct messaging at
all). If an adult tries to start a new direct message to such a minor, the attempt fails with the
same "user not found" response as a non-existent, deactivated or restricted-pending recipient, so
the answer does not reveal that a minor's account exists (Decision Log #347). We also make the
server do the same lookups for every such attempt, so the number of database queries does not
distinguish the cases.
**What this does not do:** it does not remove tiny differences in response time caused by ordinary
network and database variation. Someone able to send a very large number of repeated requests at one
target account might in principle extract a signal from that variation. We decided **not** to add
artificial delay to every message start to hide it, because that would slow every legitimate user
for a low-yield attack (Decision Log #350, an accepted limitation, revisited only if counsel or a
compliance requirement demands constant-time behaviour). The rule covers **starting** a
conversation only: an existing conversation (for example one the minor started) continues, and a
minor may message an adult. Guardian-consent gating (Section 3) still applies to a
restricted-pending minor in both directions.

### 9. How long we keep your data

**Every period below is a starting proposal for counsel to confirm or revise — not final policy —
per the retention-policy skeleton in Build Plan Section 8.2, refined where the product has since
made a concrete decision (Decision Log #42, #341, #344).**

| Data type | Retention period | What triggers change |
|---|---|---|
| Active account data (profile, content, guardian-consent record while the account is active) | For as long as your account remains active | Account deletion request (see below), guardian refusal of consent, or a defined review at the age of majority **[PROPOSAL, not yet built]** |
| **Account deletion — the 30-day grace period** | Your account and content are retained for **30 days** after you request deletion, in a `pending_deletion` state during which you cannot log in | Automatic, scheduled, once the 30-day window elapses |
| **Account deletion — after the 30-day window** | Your account record is **anonymized in place, never hard-deleted**: email, phone, date of birth, and club affiliation cleared; display name replaced with "[deleted user]"; password made unusable; account marked permanently deleted. The anonymized record has no purge timer (Decision Log #344) because it holds no personal data | Automatic, scheduled, unless an investigation hold applies |
| **Content you posted** (posts, comments, messages, match results) | On **account** deletion: **not deleted.** Stays visible, attributed to "[deleted user]" | — |
| **A post you delete yourself** | **Permanently deleted**, with every comment, like and save others made on it (Decision Log #360) | Immediate, on your request |
| **Signals that are yours alone** (follows, likes, saves, notifications, group/room/club memberships) | Removed at anonymization | Automatic, at anonymization |
| **Grassroots teams you organised** | The team survives: dormant, visible read-only, and reassignable to a new user who registers the same team name and city | Reclaim by a new registration of the same name and city |
| **Investigation hold** | If you are the reporter, the reported party, or the author of reported content in an unresolved moderation report, anonymization is **held entirely** and your account stays fully identifiable to moderators | Conclusion of the investigation. No maximum duration is currently set **[OPEN]** |
| **Guardian-consent records — separate exception** | Not deleted with the rest of your account. Separately snapshotted (the consent status, when consent was confirmed, how it was captured, and — where captured — the consent-screen version and coarse device type; not the full guardian record — the guardian's name, email and relationship to the minor are **not** retained past anonymisation — and never the raw browser string) and kept a further **6 months** after the 30-day grace period ends (**~7 months total**), so Soccernity can demonstrate valid guardian consent if challenged | Automatic, on its own separate timer |
| **Age-reclassification log** (Decision Log #349) | One row per change to your under-18 / under-16 classification: account ID, which classification, before/after, your age at that moment (no date of birth). While the account is a minor account it follows the same retention as the rest of a minor's account data; once the account is promoted to adult, the ordinary adult retention rules apply | Promotion to adult |
| **Guardian record once you turn 18** | Kept, not deleted, as consent history; no longer used to restrict the account. When you later delete your account, guardian data is handled on the normal guardian-data deletion timeframe — snapshotted into the consent record above, then deleted | Account deletion |
| Messages between users | Retained; stay visible in conversations attributed to "[deleted user]" after account anonymization. A rolling retention window for messages generally is **[PROPOSAL]** (starting figure only: 12 months) | Automatic purge past the window, if adopted |
| Moderation reports and actions | Data tied to a concluded investigation or moderation case is held for **6–7 years**, for accountability, legal claims and pattern detection | End of the retention period |
| Media you upload (photos/videos) | Tied to the lifecycle of the post or article it belongs to; stays with content that remains visible | Deleted when the parent content is deleted |

**On account deletion specifically, stated plainly:** after the 30-day window your account is
anonymized in place. The content you posted stays, under "[deleted user]," because other users'
replies, likes, and saves on it are not yours to take down. Only the signals that are yours alone
are removed. This is a deliberate design (Decision Log #341), chosen because removing a person's
identity does not require removing other people's contributions.

**Investigation hold — a genuine exception, not a technicality.** If you are the reporter, the
reported party, or the author of reported content in a report that has not been resolved, we do
not anonymize your account when the 30-day window ends. Your account stays fully identifiable to
moderators until the investigation concludes, because preserving evidence takes priority over the
ordinary 30-day timer. You still cannot log in during this time.

**Guardians and minors.** A guardian's request to delete a minor's account supersedes the
minor's own wishes. A minor cannot independently consent to keep, or delete, their own account.

**[OPEN — Nigerian-counsel cross-check]** Whether Nigeria's NDPA 2023 expects an identical
retention window for consent records as the UK-GDPR-derived reasoning above has not been
separately confirmed by Nigerian counsel and should not be assumed identical without that review.

A minor's account that never receives guardian consent no longer remains restricted-pending
indefinitely: it is closed and enters the deletion process described above (Section 4.4).

### 10. Your rights

Depending on where you are, you have rights under **UK GDPR**, **EU GDPR**, **Nigeria's NDPA
2023** and, where they apply, United States children's-privacy rules (including a parent's right to
review a child's information). These regimes give you broadly similar rights, and Soccernity's own
stated principle (Log Book Section 10.1) is to apply the stricter wherever they differ, rather than
the weaker one. These include the right to:

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

**For a minor's account:** these rights are the minor's own. However, a guardian's request to
delete a minor's account supersedes the minor's own wishes (Section 9). Other cases where a
minor's and guardian's wishes differ, and at what age a minor may exercise which right alone,
remain open for counsel (Part C).

**To exercise any of these rights**, contact us at **support@soccernity.com**. We respond within
**30 days**, for consistency across jurisdictions. **[PROPOSAL]** Counsel should confirm this is
consistent with NDPA 2023's own requirements.

**You also have the right to complain to a data protection regulator** — in the UK, the
Information Commissioner's Office (ICO); in Nigeria, the Nigeria Data Protection Commission
(NDPC); in the EU, the data protection authority in the country where you live; and in the United
States, the Federal Trade Commission (FTC).

### 11. Security

We take reasonable technical and organisational measures to protect your data, including secure
password storage (passwords are never stored in plain text) and access controls on our
moderation and administration tools.

**[PROPOSAL — technical standard TBD]** We commit to encryption at rest, and to a breach
notification procedure that separately notifies a minor's guardian as well as the affected user.
The actual technical standard has not yet been chosen; it depends in part on the still-developing
hosting setup (Decision Log #26).

### 12. Children's privacy — summary

Soccernity is built with the expectation that a meaningful share of its users are children, not
as an edge case bolted onto an adult product (Log Book Section 10.1). Sections 3 and 4 above
describe the guardian-consent mechanism in full; this section exists only to point you to them,
because it is the single most important part of this Policy for anyone assessing whether the
product is safe for a child to use.

### 13. Third parties depicted in content you didn't create

Grassroots football photography routinely captures people, including children, who are not
Soccernity users. You may report content or behaviour that violates our Terms using the
reporting tools provided. If you believe an image or video of you or your child has been posted
without an appropriate basis, you can also email **support@soccernity.com** and we will review it.

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
| 1 | **Decision Log #4 — resolved (signed off).** Scope is UK, Nigeria, US and EU; no representative required; card verification is the COPPA control. Prose applied in v0.7 | ToS §12; PP scope note, §10 | — |
| 2 | Soccernity's legal entity name, registration, and registered address | ToS & PP headers | Founder |
| 3 | **Resolved (signed off)** — lawful basis: contractual necessity + legitimate interests core, consent where required/optional, guardian consent layered. Applied in v0.7 | PP §2 | — |
| 4 | **Resolved (signed off)** — special-category data clause inserted verbatim in v0.7 | PP §2 | — |
| 5 | **Resolved** — guardian decline/withdrawal/expiry built (PR #261; Decision Log #34, #337–#340) | ToS §3.4; PP §4.4 | — |
| 6 | **Resolved in code (Decision Log #348)** — consent audit trail now also records screen version and coarse device type; counsel to confirm it is sufficient for UK GDPR Art. 7(1) (see row 17) | PP §4.2 | Counsel |
| 7 | **Resolved** — two-stage 72h+72h expiry, then the ordinary deletion process (PR #261) | ToS §3.4; PP §4.4, §9 | — |
| 8 | Non-user reporting: removed from the public ToS/PP per counsel; whether a route is built is a product matter | ToS §7.4; PP §13 | Product |
| 9 | Cross-border data-location/transfer assessment for Postmark/S3/Sentry/Render/Neon/Upstash | PP §5 | Counsel |
| 10 | Whether Leaderboard's real-names-for-minors decision needs its own dedicated safeguarding review before launch | PP §7 | Founder + counsel |
| 11 | Encryption-at-rest and breach-notification commitments, including guardian notification | PP §11 | Counsel |
| 12 | Who exercises a minor's data-subject rights, and how a minor/guardian disagreement is handled | PP §10 | Counsel |
| 13 | **Resolved (signed off)** — England & Wales, exclusive jurisdiction, savings clause; applied in v0.7 | ToS §12 | — |
| 14 | NDPA 2023 cross-check on the 6-month consent-record retention window (UK-GDPR-derived reasoning, not yet confirmed for Nigeria) | PP §9 | Nigerian counsel |
| 15 | Cookie/local-storage audit for the actual web application | PP §6 | `backend-api`/frontend + counsel |
| 16 | **Built (PR #272, Decision Log #346)** — under-16 tier. The under-16 recipient refusal is now the indistinguishable 404 (Decision Log #351, live). **Guardian-contact visibility differs from the code — see row 32** | ToS §3.5(a); PP §8 | Counsel |
| 17 | **Built (PR #274, Decision Log #348)** — consent-screen version (a manually bumped label, tripwire-checked) + coarse device type. Counsel to confirm sufficiency | PP §4.2 | Counsel |
| 18 | **Built (PRs #273/#276/#280, Decision Log #347/#350)** — adult cannot start a DM with a minor; enumeration-safe; timing jitter accepted (#350) | ToS §3.5(b); PP §8 | Counsel to confirm the accepted limitation |
| 19 | **Resolved (signed off)** — see row 4 | PP §2 | — |
| 20 | Cross-border transfer assessment (standalone restatement of row 9) | PP §5 | Counsel |
| 21 | Encryption-at-rest and breach-notification technical standard (restates row 11) | PP §11 | Founder + `backend-api` + counsel |
| 22 | **Resolved:** the full date of birth is used (not an age band) and is encrypted at rest, not hashed (comment 26). **Backend build pending:** `User.dateOfBirth` is currently a plain `DateTime?` column with no encryption in `services/api`; the DOB-encryption backend work is being built separately. The policy states the decision; do not publish until that work has merged | PP §1.1 | `backend-api` |
| 23 | Investigation hold has no maximum duration (Decision Log #345 gives visibility only) | PP §9 | Founder + counsel |
| 24 | **Age-reclassification (Decision Log #349)**: accepted ~24h misclassification window; reliance on unverified date of birth; younger-direction corrections re-apply restrictions with no notice | ToS §3.6; PP §4.5 | Counsel |
| 25 | **Resolved (Decision Log #351, live in `messaging.service.ts`)** — under-16 recipient refusal is the same 404 as other blocked paths | PP §8 | — |
| 26 | Guardian authority at 18: v0.2's "a guardian's request to delete a minor's account supersedes the minor's own wishes" (ToS §8.5, PP §9, counsel-approved) is silent on accounts that have since turned 18; also no retention period for the age-reclassification log, and whether the guardian's details should be minimised after 18 | ToS §8.5; PP §9 | Counsel |
| 27 | v0.2's restricted-pending wording ("messaged by or send messages to unverified accounts", ToS §3.2 / PP §3, counsel-approved) is looser than the code, which blocks sending and hides the account as a recipient. Left unchanged, flagged | ToS §3.2; PP §3 | Counsel |
| 28 | **Resolved (signed off)** — no EU or other representative required | ToS §12; PP scope note | — |
| 29 | **Resolved (signed off)** — card verification (PRs #297/#298) is the stated COPPA control; no further step unless a regulator requires one | ToS §3.7, §12; PP §4.6 | — |
| 30 | **Superseded** — operational items moved to row 36 | — | — |
| 31 | **Resolved (signed off)** — the blanket "we comply with all applicable laws" sentence stays removed; replacement scope wording applied in v0.7 | ToS §12; PP scope note | — |
| 32 | **Built (Decision Log #363) -- guardian-contact visibility now matches the policy text; counsel to confirm the guardian-facing disclosure and whether already-confirmed (v1) guardians need notifying.** Original note: **Guardian contact: policy text was ahead of the code.** The resolved decision shows the guardian's email on the under-16's profile card to any viewer. Today `GET /users/:id` is self-only and returns `guardianContact` only to the account itself; no public profile card exists. Needs a backend change, and the guardian-visible consent wording should disclose it (bumping `CONSENT_SCREEN_VERSION` and its tripwire hash). Do not publish this wording until built | ToS §3.5(a); PP §1.2, §7, §8 | Founder + `backend-api` + counsel |
| 33 | **Usernames are not built.** The display-name convention (username first, display name fallback) is stated, but `User` has no `username` column (Decision Log #58); everyone currently shows their display name | ToS §9.1; PP §1.1, §1.5, §7 | Founder + `backend-api` |
| 34 | **Built (Decision Log #365) -- the user-initiated guardian-email change now exists and matches ToS §3.3 / PP §4.3; counsel to confirm the wording against the shipped behaviour (below).** Original note: **User-initiated guardian-email change is not built.** No endpoint lets the minor change the guardian's email while consent is pending (the restart behaviour of Decision Log #60 has no code). As built: `POST /auth/guardian-consent/change-guardian-email`, available only while consent is *pending*; it restarts the request against the new address and the old link stops working. It is refused once consent is confirmed or declined. Not built, for counsel/founder: the *previous* guardian address is not told its address was replaced; the guardian's recorded name and relationship are not re-captured | ToS §3.3; PP §4.3 | Founder + counsel |
| 35 | A public (logged-out) report page now exists in the app (`/report`, `POST /reports/public`). Counsel removed non-user-reporting framing from the ToS, so §7.4 still does not describe it — counsel/product to confirm that is intended | ToS §7.4; PP §13 | Product + counsel |
| 36 | Card step is built but **not live** (no payment-provider keys); the 50-cent figure is configurable but hardcoded in this copy; PCI-DSS self-assessment is an operational follow-up (carried from former row 30) | ToS §3.7; PP §4.6 | Founder |

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
