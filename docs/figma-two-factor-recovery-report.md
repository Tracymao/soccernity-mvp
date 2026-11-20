# Figma: user two-factor recovery screens (adult link flow, minor guardian approval)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Date: 2026-11-01. Figma and this report only: no application code, schema, legal text, DPIA, `docs/build-register.md`, `docs/pending-copy-manifest.md` or Build Plan docx was changed. Nothing existing on the canvas was edited, archived or deleted.

Written for the figma-to-code agent that builds these in `apps/web`, and for the founder to review. The behaviour was decided by the founder (Decision Log #455 and #456). The frames were drawn from the brief; after the docs PR `docs/decisions-2fa-recovery-guardian-notices-2026-11-01` reached `main`, they were checked against #455 (build-register row B-277). They match, with two differences recorded in section 6 item 12. The report records anything the brief left undefined as open (section 6).

## 1. What was built

44 frames and 8 text nodes (a section title, a description, 6 notes), in one clear band below the existing canvas (x 0 to 14,560, y 139,560 to 147,784). Light mode, `Soccernity Theme` and `Soccernity Spacing & Radius` variables, Montserrat, desktop 1440px and mobile 390px (the viewport states keep content height; none is a fixed 844px viewport state).

Two page families, each cloned from an existing pattern so tokens and type match:

- **Sign-in side (style A)**: logo-only Top Bar (`6711:27531` desktop, `6712:27525` mobile, 90px), 440px content column desktop / 350px mobile, Montserrat Bold 22 heading, Regular 14 body, navy Medium 16 buttons. Same as the existing code prompt `6711:27530` and recovery frames `6711:27559` to `6711:27673` (Pass H).
- **Page opened from an email (style B)**: logo-only Top Bar (desktop clone of the one in `6654:2`, mobile `6654:26728`, 64px), 560px content column desktop / 350px mobile, 88px neutral circle icon, Montserrat SemiBold 26 heading, Regular 16 body, cards, green primary button. Same as the guardian withdrawal pages (`6654:2` to `6654:146`, mobile `6654:26727` to `6654:26871`). Used for the adult link pages and the guardian pages because the person arriving from an email may have no session.

All new nodes are variable-bound; destructive or alarming actions are navy/green, never red; `semantic/alert` appears only as the accent bar of an error banner and the border of a field in error (Decision Log #408 item 4: not on text or fills).

No F2 admin component is used: these are user-facing Montserrat screens, and the F2 Button / Field / Banner set is Inter-styled (Decision Log #403 item 14 already says user-facing fields need a Montserrat variant). Local auto-layout frames with the same bindings were used, the pattern the user-side pass H and the withdrawal pages use.

## 2. Node ids

Desktop / Mobile pairs. Desktop frames sit in the rows at y 140,000 (1.x), 142,800 (2.x) and 146,800 (3.x, desktop); mobile frames at y 141,400, 144,200 and 145,600. Within a row, state order runs left to right.

### 1. Request flow (sign-in side)

| State | Desktop | Mobile |
|---|---|---|
| 1.1 Code prompt with the lost-device link (revised copy) | `6912:34766` | `6912:34795` |
| 1.2a Email and password, default | `6913:34766` | `6913:34796` |
| 1.2b Email and password, wrong details or locked | `6913:34826` | `6913:34860` |
| 1.2c Email and password, too many requests | `6913:34894` | `6913:34928` |
| 1.3a Check your email, Send again in cooldown | `6913:34962` | `6913:34985` |
| 1.3b Check your email, Send again available | `6913:35008` | `6913:35031` |
| 1.3c Check your email, Send again limit reached | `6913:35054` | `6913:35081` |
| 1.4 Minor: we've asked your guardian | `6913:35108` | `6913:35129` |
| 1.5 Minor: no confirmed guardian email, points to Contact Us | `6913:35150` | `6913:35173` |

### 2. Adult link pages (and the prompt with a waiting request)

| State | Desktop | Mobile |
|---|---|---|
| 2.1 Confirm | `6914:34766` | `6914:34794` |
| 2.2 Waiting period started (shows when two-factor will be turned off) | `6914:34822` | `6914:34850` |
| 2.3 Cancel ("this wasn't me") | `6914:34878` | `6914:34902` |
| 2.4 Cancel, done | `6914:34926` | `6914:34950` |
| 2.5 Link not valid | `6914:34974` | `6914:34996` |
| 2.6 Link expired | `6914:35018` | `6914:35040` |
| 2.7 Link already used | `6914:35062` | `6914:35084` |
| 2.8 Code prompt with the "a recovery request is waiting; entering a code cancels it" banner | `6914:35106` | `6914:35140` |

### 3. Guardian pages (mobile first, then desktop)

| State | Mobile | Desktop |
|---|---|---|
| 3.1 Request summary (Approve, "I didn't expect this") | `6915:34766` | `6915:34893` |
| 3.2 Done, approved | `6915:34802` | `6915:34929` |
| 3.3 Done, declined (advice to change the password) | `6915:34824` | `6915:34951` |
| 3.4 Link expired | `6915:34849` | `6915:34976` |
| 3.5 Link already used | `6915:34871` | `6915:34998` |

### Section texts and notes

Section title `6916:34766`, description `6916:34767`. Notes: request flow desktop `6916:34768`, mobile `6916:34770`; adult link pages desktop `6916:34772`, mobile `6916:34774`; guardian pages mobile `6916:34776`, desktop `6916:34778`. Notes carry the SCOPE OPEN points of section 6.

## 3. Frame to behaviour

| Frame(s) | Behaviour that drives it |
|---|---|
| 1.1 | The user taps "Lost your device and backup codes?" on the sign-in code prompt. "Use a backup code instead" stays (the wording is reused from the admin prompt). |
| 1.2a to 1.2c | The user enters email and password. The answer is always the same "check your email" (adults). 1.2b is one neutral state for wrong details or a locked sign-in; 1.2c is a request limit (per-IP or similar). |
| 1.3a to 1.3c | "Send again" is available after 60 seconds (the 0:42 in 1.3a is a sample countdown) and limited to 3 requests an hour (1.3c). The wording does not print "60 seconds", "3" or "an hour". |
| 1.4 | The account is under 18: the request goes to the guardian (email link, valid 72 hours); the minor sees "we've asked your guardian". The 72 hours is not printed. |
| 1.5 | Under 18 with no confirmed guardian email: the flow cannot be used; the minor is pointed to Contact Us. |
| 2.1 | Adult opens the emailed link: confirm page. Pressing Confirm starts the 24-hour wait; "This wasn't me" goes to 2.3. |
| 2.2 | After Confirm: the wait has started. The account's email gets a notice with a cancel link (named in the card). Shows when two-factor will be turned off (sample 3 November 2026, 14:30). After 24 hours two-factor is removed and all sessions end. |
| 2.3, 2.4 | The cancel page (from the notice email's link, or "This wasn't me"). Cancelling leaves two-factor on and advises changing the password. A successful two-factor sign-in during the wait also cancels (2.8, 2.1 card). |
| 2.5 to 2.7 | The emailed link is not valid, expired, or already used. |
| 2.8 | A successful sign-in code cancels a waiting request: the prompt tells the user a request is waiting. |
| 3.1 | The guardian (no account) opens the emailed link and sees a summary, Approve, "I didn't expect this". |
| 3.2 | Approve removes two-factor and ends all sessions. |
| 3.3 | "I didn't expect this" declines and cancels the request; advice to change the password. |
| 3.4, 3.5 | The guardian link has expired / was already used. |

## 4. Wording, all tagged [COPY PENDING LEGAL REVIEW]

Every frame carries the `Copy Tag` chip `[COPY PENDING LEGAL REVIEW]` at frame level (the pass convention; the tag does not hold the build). That covers every new string below; none is claimed as approved, and counsel has not seen any of it.

Sign-in side (1.x, 2.8): "Enter the 6-digit code" (existing), "Enter the code shown in your authenticator app for Soccernity." (existing), "Continue", "Use a backup code instead", "Lost your device and backup codes?", "Confirm it's you", "Enter the email and password for your Soccernity account. We'll email you a link to continue.", "Email", "Password", "Enter your email", "Enter your password", "Back", "Those details didn't work", "Check your email and password and try again. If you keep getting this, sign-in may be locked for a short while.", "Too many requests", "Please wait a while before trying again.", "Check your email", "If those details are right, we've emailed a link to the address on your account. Open it to continue.", "Can't find it? Check your spam folder.", "Send again", "Send again in 0:42", "Back to log in", "You've asked for too many emails", "Please try again later.", "We've asked your guardian", "We've emailed the guardian on your account. They need to open the link and approve before two-factor is removed.", "You don't need to do anything else. Until then you can still sign in with your authenticator app or a backup code.", "We can't send this request yet", "We don't have a confirmed guardian email on your account, so we can't ask for approval.", "Please contact us and we'll help you get back into your account.", "Contact us", "A recovery request is waiting", "Entering a code now cancels it."

Adult link pages (2.1 to 2.7): "Remove two-factor from your account?", "You asked to sign in without your authenticator app or backup codes. If you confirm, we'll wait 24 hours, then turn off two-factor and sign you out everywhere.", "Before you confirm", "We'll email you a notice with a link to cancel.", "Signing in with your authenticator app during the wait also cancels this request.", "Confirm", "This wasn't me", "Your request has started", "Two-factor will be turned off on 3 November 2026 at 14:30. You'll be signed out everywhere at that time.", "What happens next", "We've emailed you a notice with a link to cancel.", "If you didn't ask for this, cancel it now and change your password.", "Done", "Cancel this request", "Cancel this recovery request?", "If you didn't ask to remove two-factor, cancel it now. Nothing has changed on your account yet.", "Cancel the request", "Go back", "Request cancelled", "Two-factor stays on. As someone else may know your password, we recommend you change it now.", "Change my password", "This link isn't valid", "Check that you opened the whole link from the email, or start again from sign-in.", "This link has expired", "Start again from sign-in to get a new link.", "This link has already been used", "Each link works once. If you didn't use it yourself, sign in and change your password."

Guardian pages (3.x): "Approve removing two-factor?", "The young person whose Soccernity account you gave consent for says they've lost their device and backup codes. They've asked to sign in without two-factor.", "The request", "Account", "Asked on", "If you approve", "Two-factor is removed from the account.", "They're signed out everywhere. They can then sign in with their password and set two-factor up again.", "Approve", "I didn't expect this", "Request approved", "Two-factor has been removed from the account and they've been signed out everywhere. They can sign in with their password and set up two-factor again.", "Request declined", "We've cancelled the request. Two-factor stays on.", "If you didn't expect this", "Someone else may know the account's password. Ask them to change it now.", "This link has expired", "The request can no longer be approved. The young person can ask again from sign-in.", "This link has already been used", "This request has already been answered, so there is nothing more to do."

Numbers in wording: "24 hours" (adult screens only, decided) and the sample date, time and countdown. The 72-hour guardian link lifetime, the 60-second cooldown and the 3-an-hour limit are **not printed anywhere**. Sample values: the account handle `nelson_iheagwam`, the dates and times, the countdown.

## 5. Self-checks

Measured with a node walk after the last write (Decision Log #404 item 14: ids hashed, no whole-page `get_metadata`).

| Check | Result |
|---|---|
| Top-level nodes on `0:1` | 1,099 before, 1,151 after (+52: 44 frames, 2 section texts, 6 notes) |
| Hash of the first 1,099 top-level ids, in order (djb2 over the comma-joined ids) | `2538344190` before and after, identical |
| Existing nodes edited, moved, archived or deleted | 0 |
| Visible solid paints on new nodes not bound to a variable | 0 (logo groups and vectors inside the cloned Top Bars were counted separately: 0 unbound solid paints there too) |
| Image fills | 0 |
| `brand/green-tint-28`, new colours | 0 |
| Text not in Montserrat (354 text nodes) | 0 |
| Text running beyond its frame width | 0 |
| Overlaps of any new top-level node with another top-level node | 0 |
| Contrast | text colours are the existing token pairs (primary and secondary on `color/background/page` / `surface`; `on-navy` on navy; `on-green` (navy) on `brand/green` 5.28:1, Decision Log #96). Disabled buttons use secondary text on 15%-navy: decorative state, not measured as an AA pair. |

Not taken: a per-top-level-node `findAll` count before the first write, so the per-node snapshot comparison of Decision Log #404 item 14 is not available; only the count and id hash are (the same disclosure as pass K). Screenshots were checked for 1.1 (D and M), 1.2b (M), 1.3c (D), 2.1 (M), 2.2 (D), 3.1 (D and M), and one note. The other states reuse the same builder and the same checked patterns.

## 6. Open, undecided or not drawn (also on canvas as SCOPE OPEN notes)

1. **Existing frames to revise (not edited here).** The existing prompt `6711:27530` / `6712:27524` carries the older link "Can't use your authenticator app?" leading to the choose-method frames; 1.1 is its revised version. The choose-method frames `6711:27559` / `6712:27553` (backup code or "Confirm by email and password") and the older email+password and check-your-email frames `6711:27646` / `6711:27673` (and mobile twins) describe a flow where the confirmation email is followed by a password entry; the decided flow takes the password first (1.2a) and the email link next. They should be revised or retired.
2. **Wrong versus locked versus rate limited on email and password (1.2b, 1.2c).** Drawn as two states with one neutral wording each; whether the API gives distinct answers (and whether "wrong" must be indistinguishable from "check your email") is not decided.
3. **The minor screen reveals the age tier.** 1.4 differs from 1.3, as decided. Whether it appears only after the password is verified is open; if shown before, anyone can learn whether an email belongs to a minor.
4. **Minor Send again** is not drawn (the brief gives the 60 s and 3-an-hour behaviour for the adult flow only).
5. **Time format and time zone** of the date on 2.2 are undecided (the sample is "3 November 2026 at 14:30").
6. **Destinations not wired** (no prototype links were added): "Contact us" (Contact Us page), "Change my password", "Back to log in", "Done". Where the cancel page lands for a signed-out person, and whether the cancel page needs a sign-in, is undecided.
7. **2.5 / 2.6 / 2.7 are separate states**; whether the page may distinguish them is an enumeration question for counsel. The guardian pages draw expired and already used only, as briefed; "not valid" is not drawn for the guardian.
8. **Guardian summary fields.** The handle and request time are samples; the real list of fields the page may show is undecided. No real name of the young person is shown by default. No confirmation step after Approve is drawn. Whether the young person is emailed after approval or decline is not drawn. "I didn't expect this" is drawn as the decline; whether it should offer a way to report is open.
9. **Not drawn at all:** the notice email, the guardian email, a loading state, an offline state, the lock-after-attempts state of the 6-digit code, the "sign-in cancelled the request" confirmation after a successful code, and the admin side. The 24-hour wait's "what happens at the end" screen (two-factor removed) is not drawn (the next sign-in is a normal one).
10. **Backup-code path.** The "Use a backup code instead" link on 1.1 and 2.8 reuses the wording of the admin prompt; its destination is the existing backup-code frames (`6711:27590`, `6711:27617`), not redrawn.
12. **Differences from Decision Log #455 found after it merged.** (a) #455 says the minor is told to change their password when the guardian answers "I didn't expect this"; frame 3.3 tells the guardian to ask them to (the minor's own notice is an email, not drawn). (b) #455 sends a completion email when an adult's wait ends and tells the minor's own email about a request; neither email is drawn. (c) #455 says the email is sent only when the password is right and a wrong password counts toward the normal sign-in lock; 1.2b and 1.3 are consistent with that, but 1.2b's wording does not mention the lock.
11. **Decision Log candidates.** The two frame families (sign-in style and email-page style) for one flow; the guardian page reusing the withdrawal page pattern; the "24h" glyph on the waiting icon; whether a guardian with several children needs the account named more clearly than a handle.

## 7. Not done

No code. No prototype wiring. No Figma components created (all local frames). No `docs/build-register.md` or Decision Log edit; status lines for the register rows this serves (B-087, B-111) are for the next docs PR.
