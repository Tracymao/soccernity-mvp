# Sprint 2 — Mobile Settings leaves, Community mobile rebuild, Message pillar rebuild

Branch (to be created in a follow-up shell session): `sprint-2/mobile-settings-community-message-rebuild`
Figma file: `weZWWqggy9j13eX8bhFgs6`, page `0:1` ("Soccernity")
Scope: **Figma design only.** No application or backend code was touched.
Status: **not merged** — same standing instruction every design-stage PR in this project follows.

This session had **no Bash tool**. All Figma work, this report, and the exact
follow-up shell steps are below. CLAUDE.md and the Build Plan `.docx` Decision Log
were **not** edited here — see §9 for why, and for the ready-to-paste text.

---

## 0. Preconditions, verified live (not taken from the brief)

| Check | Result |
|---|---|
| `Soccernity Theme` collection | `VariableCollectionId:5096:2` present, modes Light `5096:0` (default) / Dark `5096:1` |
| Variable count | **13** COLOR variables (the 12 in CLAUDE.md + `semantic/alert` `VariableID:5670:8226`) |
| Token pass complete? | **Yes** — proceeded |
| `Avatar` COMPONENT_SET `5685:9241` | present, `Has Unread` boolean |
| Navbar variants `2824:4309` | `header 4` `2838:3502`, `header 7` `2841:4104`, `header 7 — mobile` `5386:6575`, `header 4 — mobile` `5386:6576` |
| All 12 desktop Settings leaf node IDs from the brief | **all 12 resolve, and all 12 match the names the brief claims** |
| Pages | `0:1` Soccernity, `1860:2500` cover, `2155:1285` dump |

**No `SECTION` nodes exist on page `0:1`.** What previous PRs call "section
banners" are giant `TEXT` nodes (font size 770). See §8.6.

---

## 1. What shipped

### Task 1 — 12 Settings leaf screens, mobile (390px)

Pattern reused: the five PR #112 mobile Settings frames (`5649:8074` etc.) —
64px `Top Bar — Soccernity`, `Content` at padding 20/20/40/20 gap 22, a
`Back to Settings` row, a `Header` (Bold 22 + Regular 13), and `Settings Group`
cards (radius 12, `color/background/surface`) of 64px rows with dividers.
Reproduced exactly: same node names, same type ramp, same tokens.

| # | New mobile frame | Node ID | Desktop source |
|---|---|---|---|
| 1 | Settings — Account Info (Confirm Password) — Mobile | `5695:8213` | `2922:6396` |
| 2 | Settings — Change Password — Mobile | `5695:8234` | `2924:6870` |
| 3 | Settings — Deactivate Account (Intro) — Mobile | `5695:8262` | `2924:7358` |
| 4 | Settings — Security Overview — Mobile | `5695:8279` | `2926:8056` |
| 5 | Settings — Two-Factor Auth (SMS) — Mobile | `5696:8213` | `2926:8294` |
| 6 | Settings — Direct Messages & Read Receipts — Mobile | `5696:8241` | `2926:8764` |
| 7 | Settings — Your Posts (Sensitive Media) — Mobile | `5696:8261` | `2926:8996` |
| 8 | Settings — Notifications (Mute & Filter) — Mobile | `5696:8281` | `2926:9230` |
| 9 | Settings — Mute New Accounts — Mobile | `5696:8307` | `2926:9482` |
| 10 | Settings — Notification Preferences — Mobile | `5696:8340` | `2926:9721` |
| 11 | Settings — Push Notifications — Mobile | `5696:8364` | `2927:9954` |
| 12 | Settings — Email Notifications — Mobile | `5696:8384` | `2927:10205` |

Placed at `y = -8642`, `x = -1751` stepping +500, continuing the existing
mobile Settings strip. Also added `Section Title — Settings (Mobile)`
(`5698:8239`) above the strip — see §8.6.

**New component: `Settings Toggle` (`5694:8219`)**, variants `State=Off`
(`5694:8213`) / `State=On` (`5694:8216`). State is signalled by **both** rail
colour and knob position, never colour alone.

### Task 2 — Community mobile rebuilt at 390px

| New frame | Node ID | Replaces | Archived as |
|---|---|---|---|
| Community — Home Feed — Mobile | `5701:8239` | community mobile 1 | `1708:2321` |
| Community — Home Feed (Navigation Drawer Open) — Mobile | `5703:8250` | community mobile 2 | `1762:2847` |
| Community — Create Post — Mobile | `5701:8328` | community mobile 3 | `1708:2401` |
| Community — Profile — Mobile | `5702:8250` | community mobile 4 | `1769:5230` |
| Community — Edit Profile — Mobile | `5702:8317` | community mobile 5 | `1770:5435` |

All five originals were **archived, not deleted** — `visible:false`, renamed
`ARCHIVED — community mobile N (428px, absolute layout — superseded by 390px
auto-layout rebuild)`, moved to the archive strip at `y 26200`, `x 8150`+500.
New frames sit at `y 23522`, `x 7031`+500.

Genuinely rebuilt with auto-layout — every horizontal card row stacks and every
text block reflows. Nothing was resized or copied by absolute position.

### Task 3 — Message pillar rebuilt, desktop + mobile

| New frame | Node ID | Size |
|---|---|---|
| Message — Conversation — Desktop | `5706:8271` | 1440×1024 |
| Message — Inbox (No Conversation Selected) — Desktop | `5708:8184` | 1440×1024 |
| Message — Empty Inbox (No Conversations) — Desktop | `5708:8362` | 1440×1024 |
| Message — Inbox (Chat List) — Mobile | `5709:8354` | 390×844 |
| Message — Conversation — Mobile | `5709:8419` | 390×844 |
| Message — Conversation (Actions Menu Open) — Mobile | `5709:8461` | 390×844 |
| **Component** — Message — Conversation Actions Menu | `5706:8270` | 311×177 |

Archived (hidden + renamed + moved, not deleted):

| Node | Was | Moved to |
|---|---|---|
| `1871:2762` | Message - no message page | `47411, 10200` |
| `2025:8112` | Message - chat page desktop | `48891, 10200` |
| `2067:3006` | Message - List of chats - mobile app (360px) | `30506, 24300` |
| `2067:3176` | Message - single chat page - mobile app (360px) | `30910, 24300` |

The three new desktop frames occupy the slot the originals vacated
(`y 7019`, `x 47411 / 48891 / 50371`), directly under the existing "Message"
banner. New mobile frames at `y 22935`, `x 31814 / 32314 / 32814`.

---

## 2. The Community template finding — PR #112's note needs correcting

PR #112 recorded that `1306:7149` (Community Home Page Template) and its
instance `1308:11643` "are both `visible: false` and render nothing anywhere in
the file."

**Half of that is right, and the conclusion drawn from it is wrong.** The
COMPONENT_SET and the instance are indeed `visible:false`, so nothing renders on
canvas. But the set's **two variants are fully populated and individually
`visible:true`**:

| Variant | Node | Children | Visible TEXT nodes |
|---|---|---|---|
| `Property 1=Desktop - 6` | `1306:7148` | 100 | 111 |
| `Property 1=Desktop - 7` | `1306:7147` | 102 | 111 |

The template contains a complete desktop Community home page: a top bar with
search, a left column (profile card, Trending News, Suggested follows), a centre
column (a "What's happening?" composer with Post button and media icons, then
feed post groups), and a right column (Trends for you, Fixtures).

So **no fallback was needed** — the brief's contingency ("if the template
genuinely has no usable content, fall back to…") did not apply. I read the
structure programmatically rather than by screenshot, and did **not** unhide
anything: the set and instance are still `visible:false` exactly as found.

**What did not map to a mobile reflow**, and why:

- **Trends for you / Fixtures / Trending News / Suggested follows sidebars** —
  omitted. These are the same placeholder sidebars CLAUDE.md already records
  `ProfilePage.tsx` deliberately not reproducing, and the fixtures/news half is
  blocked on Decision Log #6 (no sports-data vendor) with no Section 4 endpoint
  behind it. Reproducing them on mobile would present placeholder content as a
  built feature.
- **Post engagement counts** (25 / 124 / 345) were reused as-is by cloning the
  existing icon group, so the real iconography carries over.
- **Lorem ipsum post bodies** were **not** carried over — see §8.3.

---

## 3. Message section inventory + before/after colour audit

### 3.1 Inventory as found

| Node | What it is | Size | Disposition |
|---|---|---|---|
| `1871:2762` | Message - no message page (desktop) | 1440×1024 | archived |
| `2025:8112` | Message - chat page desktop | 1440×1024 | archived |
| `2067:3006` | Message - List of chats - mobile app | **360**×601 | archived |
| `2067:3176` | Message - single chat page - mobile app | **360**×601 | archived |
| `5648:8054` | Message — No Messages (Empty State) — Mobile (PR #112) | 390×602 | **retained** |
| `1762:2833` | Messages mobile window 3 — actions context menu | 311×177 | **converted to component `5706:8270`** |
| `1761:2342` / `1761:2321` / `1762:2645` | Messages mobile windows 1 / 2 / 4 | — | already archived by PR #112 |
| `1306:354` | Community homepage with message sidebar and chat pop up | 1440×1820 | **not touched** — Community pillar, not Message |

`5648:8054` was **retained, not rebuilt**: it is already 390px, already 100%
token-bound (31/31 paints), and already matches the rebuild's visual language.
Rebuilding it would have produced a duplicate for no gain.

### 3.2 Colour audit — before (the 6 pre-existing Message frames)

| Frame | Solid paints | Bound | Unbound | Off-palette found |
|---|---|---|---|---|
| `1871:2762` | 116 | 114 | 2 | `#a1584a` ×1, `#1e1e1e` ×1 |
| `2025:8112` | 138 | 132 | 6 | `#d9d9d9` ×4, `#ffffff` ×2 |
| `2067:3006` | 50 | 45 | 5 | `#d9d9d9` ×5 |
| `2067:3176` | 37 | 33 | 4 | `#d9d9d9` ×4 |
| `5648:8054` | 31 | 31 | 0 | — |
| `1762:2833` | 13 | 13 | 0 | — |
| **Total** | **385** | **368 (95.6%)** | **17** | `#1e1e1e`, `#a1584a`, `#d9d9d9` ×13, `#ffffff` ×2 |

### 3.3 Colour audit — after (the rebuilt Message pillar)

| Frame | Paints | Bound | Unbound | Detail |
|---|---|---|---|---|
| `5706:8271` Conversation — Desktop | 132 | 131 | 1 | Navbar avatar `[IMAGE]` |
| `5708:8184` Inbox (none selected) — Desktop | 108 | 107 | 1 | Navbar avatar `[IMAGE]` |
| `5708:8362` Empty Inbox — Desktop | 89 | 88 | 1 | Navbar avatar `[IMAGE]` |
| `5709:8354` Inbox — Mobile | 46 | 45 | 1 | Navbar avatar `[IMAGE]` |
| `5709:8419` Conversation — Mobile | 33 | 33 | **0** | — |
| `5709:8461` Conversation (menu open) — Mobile | 48 | 48 | **0** | — |
| `5706:8270` Actions Menu component | 14 | 14 | **0** | — |
| **Total** | **470** | **466 (99.1%)** | **4** | all 4 = the shared Navbar's avatar photo |

**Zero off-palette hex values remain.** `#1e1e1e`, `#a1584a` and `#d9d9d9` are
gone from the live Message pillar. The only unbound paints are the `IMAGE` fill
inside the shared `header 4` / `header 4 — mobile` Navbar instances — component
debt that cannot be edited from an instance, the same exception PR #112
disclosed.

### 3.4 Whole-delivery audit (all 25 new nodes)

| Group | Paints | Bound | Unbound |
|---|---|---|---|
| 12 Settings mobile leaves | 203 | **203** | **0** |
| 5 Community mobile frames | 267 | 265 | 2 (`[IMAGE]`) |
| 6 Message frames | 456 | 452 | 4 (`[IMAGE]`) |
| 2 components | 19 | **19** | **0** |
| **Total** | **945** | **939 (99.4%)** | **6 — all Navbar avatar `[IMAGE]`** |

- **`brand/green-tint-28` usages across all new work: 0** (Decision Log #47 respected).
- **No new colour introduced.** `semantic/alert` used only per §8.2.
- **Frame overlap check across all 23 new frames: 0 overlaps.**

---

## 4. Desktop copy fixes applied (Task 1 requirement)

24 pure copy edits, applied to the desktop leaf frames **and** mirrored in the
new mobile builds so the two do not diverge. All 24 applied cleanly, 0 skipped.

| Desktop frame | Node | From | To |
|---|---|---|---|
| Security Overview | `2926:8173` | "Two factor Authentication" | "Two-factor authentication" |
| Security Overview | `2926:8291` | "Two factor Authentication" (2nd, identical heading on the nav row) | "Set up two-factor authentication" |
| 2FA (SMS) | `2926:8403` | "Two factor authentication" | "Two-factor authentication" |
| 2FA (SMS) | `2926:8526` | "Authentication App" | "Authentication app" |
| Direct Messages | `2926:8874` | "Direct message" | "Direct Messages" |
| Direct Messages | `2926:8881` | "Read receipt" | "Read receipts" |
| Sensitive Content | `2926:9106` | "Your post" | "Your posts" |
| Mute & Filter | `2926:9348` | "Mute Notification" | "Mute notifications" |
| Mute New Accounts | `2926:9591` | "Mute notification from people" | "Mute notifications from people" |
| Mute New Accounts | `2926:9598` | "you don't follow" | "People you don't follow" |
| Mute New Accounts | `2926:9712` | "who you don't follow" | "People who don't follow you" |
| Mute New Accounts | `2926:9715` | "who has a new account" | "People with a new account" |
| Notification Preferences | `2926:9830` | "Preference" | "Preferences" |
| Notification Preferences | `2926:9841` | "Push Notification" | "Push notifications" |
| Notification Preferences | `2926:9951` | "Email Notification" | "Email notifications" |
| Push Notifications | `2927:10073` | "Turn on Push Notification" | "Turn on push notifications" |
| Email Notifications | `2927:10325` | "Turn on Email Notification" | "Turn on email notifications" |
| Email Notifications | `2927:10449` | "New notification" | "New notifications" |
| Email Notifications | `2927:10443` | "Direct message" | "Direct messages" |
| Email Notifications | `2927:10446` | "Post email to you" | "Posts emailed to you" |
| Change Password | `2924:7354` | "…all your active Soccernity **page** except…" | "…all your active Soccernity **sessions** except…" |
| Deactivate Account | `2924:7468` | "…viewable on **soccernity.com**" | "…viewable on **Soccernity.com**" |
| Deactivate Account | `2926:7603` | "restore your **soccernity** account" | "restore your **Soccernity** account" |
| Confirm Password | `2922:6511` | "Confirm your **P**assword" | "Confirm your **p**assword" |

Notable: the **"Mute New Accounts" fragment list** was the worst of these —
three sentence fragments, two of which ("you don't follow" / "who you don't
follow") were near-identical and unreadable as distinct settings.

Additional copy improvements made on the mobile builds only, because the desktop
frames have no equivalent element to fix: a `Use at least 8 characters.` helper
on Change Password (Decision Log #14, matching what PR #104 did for Reset
Password), and a real one-line subtitle under every leaf heading (the desktop
leaves have none).

**Deliberately NOT fixed — see §8.4.** Three desktop leaves carry *structural*
content leakage rather than wrong words. Fixing those means deleting or
re-scoping whole rows with live controls, which is layout surgery on
already-built screens and needs a product decision about what belongs there.

---

## 5. Bugs found and fixed during this work

1. **`Messages mobile window 3` had no usable background.** Converting it to a
   component and placing it over a scrim revealed it rendered effectively
   transparent, so its labels became unreadable against the dimmed conversation
   behind. It had only ever looked correct because it sat on empty white canvas.
   Fixed on the component: explicit `color/background/surface` fill, radius 12,
   1px `color/icon/inactive` border.
2. **The same component's row highlight was bound to `brand/navy` with a
   paint-level 5% opacity**, which does not survive variable binding (§8.5) — it
   rendered as a solid navy pill with invisible navy text on top. Rebound to
   `brand/green-tint`, the file's actual wash token, whose alpha comes from the
   token itself.
3. **27 auto-layout rows across the new Community frames were frozen at 100px
   tall.** My own authoring error: I set `counterAxisSizingMode = 'FIXED'` on
   horizontal frames *before* appending their children, freezing the empty
   frame's default height. Caught by screenshot, then fixed by forcing
   `layoutSizingVertical = 'HUG'` and re-measuring every affected row.
4. **Two scrims rendered fully opaque** for the reason in §8.5. Both re-applied
   so the dimmed content beneath is genuinely visible.
5. **Chat bubbles were all forced to one width**, so a three-word message was as
   wide as a three-line one. Changed to hug content with a max width (330px
   desktop / 250px mobile).
6. **Desktop "Message - no message page" was self-contradictory** — it showed a
   populated 8-conversation list next to the copy "You don't have any message in
   your inbox." Those are two different states. The rebuild splits them into
   `Inbox (No Conversation Selected)` and `Empty Inbox (No Conversations)`, with
   the empty state genuinely showing an empty list.
7. Legacy copy defects retired with the archived frames rather than carried
   forward: "Send and **recieve** message", "**Arsernal** in the mud", "You
   don't have any **message**" (singular), and five identical
   "Emeka Hassan / Hey Man / 10h / 2" placeholder rows.

---

## 6. Screenshots reviewed

Every new screen family was rendered and visually checked before being called
done: Change Password, Email Notifications and Deactivate Account (Settings);
Home Feed, Profile, Edit Profile and the drawer state (Community); Conversation
Desktop, Empty Inbox Desktop, Inbox Mobile, Conversation-with-menu Mobile, and
the Actions Menu component in isolation (Message). Four of the six bugs in §5
were found *only* because of those renders, not from the API responses.

---

## 7. Backend reality — flagged, nothing wired

- **Messaging/DMs do not exist.** No `POST`/`GET` message endpoints; `/messages*`
  is unbuilt Sprint 3 work. Every Message screen here is design only.
  `figma-to-code` must not wire them.
- **DM restrictions for pending-consent minors** remain Decision Log #12 —
  guidance for whoever builds messaging, not implemented anywhere.
- **Settings leaves are largely unbacked**: 2FA (SMS, authenticator app,
  "security key") has no schema or endpoint anywhere; notification
  preference/push/email toggles have no persistence; read receipts, quality
  filter and mute rules have no model. Only Change Password
  (`POST /auth/change-password`) and Deactivate (`POST /auth/deactivate-account`)
  map to real, shipped endpoints.
- **Community profile fields**: Bio, Location, Preferred Club and Date of Birth
  are rendered on Edit Profile but have no writable backing — Decision Log #58
  (username/avatar/bio/location columns) and #74 (represented club) are the open
  items; DOB is deliberately server-excluded because it could flip `isMinor`.

---

## 8. Judgment calls (Decision Log candidates)

> **Numbering (reconciled at finalisation).** The live `docs/Soccernity_MVP_Build_Plan_v1.7.docx`
> Table 6 ended at **#106** (PR #115 added #104–#106). These entries were
> transcribed as **#107–#120** and the headers below have been renumbered to
> match. `#45` remains a genuinely un-written gap in the table, unrelated to this pass.

**#107 — New `Settings Toggle` component; existing `Toggle Switch` not reused.**
`2927:10195` is a broken orphan: 92×87, two stacked instances rather than
variants, a 10px-tall rail, one child positioned outside its own bounds, and
**0 instances anywhere in the file**. A new `Settings Toggle` COMPONENT_SET
(`5694:8219`) was built instead, reusing its *visual language* (green wash rail,
navy knob). Recommend deleting `2927:10195`.

**#108 — Deactivate Account uses a navy button, not a red one.** White on
`semantic/alert` `#FA0606` measures **4.12:1** — below the 4.5:1 AA threshold
for a 14px button label. Navy + `color/text/on-navy` measures **12.6:1**.
`semantic/alert` is therefore used as a non-text left accent bar on the "What to
know" card, and the button stays navy. This matches the precedent already set
for green (scoped to non-text because green-on-light fails AA).

**#109 — 24 desktop copy fixes applied to already-built Settings leaves.**
Authorised explicitly by this task's brief. Listed in full in §4.

**#110 — Three structural content leaks flagged, NOT fixed; one deliberate
desktop/mobile divergence.** (a) `2926:8764` Direct Messages and `2926:8996`
Your Posts both carry a full "Authentication app" 2FA row — copy-pasted from
`2926:8294`, where it legitimately belongs. (b) `2926:9721`, `2927:9954` and
`2927:10205` each have an fs18 heading overlapping an fs16 labelled row at the
same coordinates, and `2927:10205` (Email) carries a row labelled "Push
notification". These are rows with live checkbox controls, not stray text — the
fix is deletion or re-scoping, i.e. layout surgery on built screens, which is
`figma-design-system`'s domain, and *what should replace them* is a product
decision. The new mobile screens omit the leaked blocks. **Desktop and mobile
therefore differ on those three screens, deliberately and visibly**, until this
is resolved. Also recommend renaming `2926:8996` from "Sensitive Content & 2FA
App" once resolved — its name describes the leaked content.

**#111 — PR #112's "Community Home Page Template renders nothing" needs
amending.** The set and instance are hidden, but both variants are fully
populated (100/102 children, 111 text nodes each). See §2. Whether the template
should be unhidden, promoted, or archived is a founder call — this pass left it
exactly as found.

**#112 — Community mobile placeholder content replaced with real copy.** The
legacy frames' post bodies were lorem ipsum. Reproducing lorem ipsum in a
rebuild would present placeholder as design intent, so the new feed carries
plausible grassroots-football copy (Sunday league at Rowe Park, a five-a-side
pitch booking question). This is illustrative sample content, not approved
product copy.

**#113 — Avatars are tokenised initial discs, not photographs.** Every avatar
authored in this delivery is a `brand/green-tint` disc with navy initials, so
the new frames carry zero unbound image paints. The only image fills left are
inside shared Navbar instances. Precedent: PR #112's Notification Centre avatar
discs.

**#114 — Which Message frames are canonical is a founder call.** The rebuild
does not delete anything: `1871:2762`, `2025:8112`, `2067:3006`, `2067:3176` are
hidden and prefixed `ARCHIVED —`. This is the same three-frames-coexist
situation the homepage hit (resolved by Decision Log #46). Recommend confirming
the six new frames as canonical and then deciding whether the archived ones —
and the five archived Community mobile frames — should be **deleted outright**.

**#115 — `Messages mobile window 3` is now a component, closing DL #89's open
item.** `Message — Conversation Actions Menu` (`5706:8270`), instanced onto
`Message — Conversation (Actions Menu Open) — Mobile`. Two real defects were
fixed in the process (§5.1, §5.2). "Block User" remains `semantic/alert`.

**#116 — Message desktop split from 2 states into 3.** The original "no message
page" conflated "no conversation selected" with "empty inbox" and showed a
populated list beside empty-inbox copy. Now three distinct, non-contradictory
states.

**#117 — File-wide authoring gotcha: a bound paint takes its alpha from the
variable, not from the paint's own `opacity`.** Setting
`{opacity: 0.3}` and then calling `setBoundVariableForPaint(…, 'brand/navy')`
yields a **fully opaque** paint, because `brand/navy` is `#282E65` with alpha 1.
This silently produced two solid-navy scrims. Two consequences worth recording:
(a) translucency must come from a token that carries its own alpha
(`brand/green-tint` 12%, `color/icon/inactive` 15%, `color/text/secondary` 70%),
or the opacity must be re-applied to a copy of the paint *after* binding;
(b) any prior "0 unbound paints" audit in this file may have passed while a paint
still rendered at the wrong alpha, because binding and rendered alpha are
different things. This belongs in the file's Figma notes alongside the existing
`setBoundVariableForPaint` warning.

**#118 — No elevation/shadow token exists**, so the Actions Menu overlay uses a
1px `color/icon/inactive` border instead of a drop shadow. This is the same
open item CLAUDE.md already records; it now has a concrete overlay depending on
it.

**#119 — Mobile frame height convention is inconsistent.** The two Message
conversation screens and the Community drawer are fixed **844px** viewports
(they need a pinned composer and full-height overlays); the remaining new mobile
frames hug their content, matching the existing Settings mobile family. The
retained empty state `5648:8054` is 602. Worth settling one convention.

**#120 — Section "banners" are display words, not coverage rectangles.** There
are no `SECTION` nodes on `0:1`; the banners are `TEXT` at font size 770. The
Settings banner (`2930:10458`, width 3386) never spanned even the existing
desktop family, so "widening it to cover" the new frames would mean stretching a
single word to ~19,000px for no visual effect. Instead I added
`Section Title — Settings (Mobile)` (`5698:8239`) above the mobile strip,
matching the newer `Section Title — …` convention already used for Guardian
Consent / Club Picker / Notification Centre. The new Message desktop frames were
placed in the slot the archived originals vacated, so they sit under the
existing "Message" banner unchanged; the new Message mobile frames already fall
inside the "Message Mobile" banner's span.

---

## 9. Follow-up shell session — exact steps

This session had no Bash tool, so the branch, commit, PR, CLAUDE.md bullet and
`.docx` Decision Log transcription must be done in a session with shell access —
the same pattern as PRs #98 / #102 / #110 / #113 / #114.

**CLAUDE.md was deliberately not edited here.** The only file-writing tool
available was whole-file `Write`, which would have required re-emitting the
entire (very large) file from context. On a file this load-bearing, the risk of
silent transcription drift outweighed the benefit, especially since a follow-up
session is required anyway for the commit and the `.docx`. The exact bullet to
insert is in §9.3.

### 9.1 Branch, commit, PR

```
cd D:\Projects\soccernity-mvp
git checkout main
git pull
git checkout -b sprint-2/mobile-settings-community-message-rebuild
# add this report, the CLAUDE.md bullet (§9.3), and the .docx Decision Log edits (§9.2)
git add docs/sprint-2-mobile-settings-community-message-rebuild-report.md CLAUDE.md docs/Soccernity_MVP_Build_Plan_v1.7.docx
git commit -m "Mobile Settings leaves, Community mobile 390px rebuild, Message pillar rebuild (Figma design only)"
git push -u origin sprint-2/mobile-settings-community-message-rebuild
gh pr create --base main --title "Sprint 2: mobile Settings leaves, Community mobile rebuild, Message pillar rebuild" --body-file docs/sprint-2-mobile-settings-community-message-rebuild-report.md
# DO NOT MERGE — Temi's call after independent verification
```

### 9.2 Build Plan Section 9 (Table 6) via python-docx

**First reconcile the numbering** (see the caveat in §8): read the last row of
Table 6 — DONE at finalisation: entries transcribed as #107–#120.

```python
from docx import Document
d = Document(r"D:\Projects\soccernity-mvp\docs\Soccernity_MVP_Build_Plan_v1.7.docx")
t = d.tables[5]                     # Section 9, Table 6 — confirm before writing
print([c.text for c in t.rows[-1].cells])   # <-- confirm the real next free number first
for num, title, status in ENTRIES:  # ENTRIES = the 14 entries from §8, renumbered
    r = t.add_row().cells
    r[0].text, r[1].text, r[2].text = num, title, status
d.save(r"D:\Projects\soccernity-mvp\docs\Soccernity_MVP_Build_Plan_v1.7.docx")
```

Also append a forward-pointer to **Decision Log #89**'s Status column
("`Messages mobile window 3` is now a component — see #115") and to
**#47** (this delivery introduced zero `brand/green-tint-28`).

### 9.3 CLAUDE.md — bullet to add to "Where things stand right now"

Insert immediately after the `sprint-2/avatar-notification-dropdown-wiring` bullet:

> - **`sprint-2/mobile-settings-community-message-rebuild` builds the 12 deeper
>   Settings leaf mobile screens PR #112 deferred, rebuilds all 5 Community
>   mobile frames at 390px with real auto-layout, and rebuilds the entire
>   Message pillar desktop + mobile** — 23 new frames + 2 new components, Figma
>   design only, no app/backend code. Full detail:
>   `docs/sprint-2-mobile-settings-community-message-rebuild-report.md`.
>   - **Settings (12 new 390px frames, `5695:8213`–`5696:8384`)** follow PR
>     #112's mobile pattern exactly. New **`Settings Toggle`** component set
>     (`5694:8219`, `State=On`/`State=Off`); the pre-existing `Toggle Switch`
>     (`2927:10195`) was **not** reused — it is a broken orphan (92×87, two
>     stacked instances not variants, a child outside its own bounds, 0
>     instances file-wide) and is recommended for deletion. **24 desktop copy
>     bugs fixed on the 12 source frames and mirrored on mobile** — incl. a
>     three-fragment unreadable list on Mute New Accounts, "Soccernity **page**"
>     → "sessions", lowercase "soccernity.com", and five
>     singular/plural/casing errors. **Deactivate Account uses a navy button,
>     not red**: white on `semantic/alert` measures **4.12:1** and fails AA;
>     alert is used only as a non-text accent bar.
>   - **Community: all 5 legacy 428px absolute-layout frames rebuilt at 390px**
>     (`5701:8239`, `5703:8250`, `5701:8328`, `5702:8250`, `5702:8317`) and the
>     originals **archived, not deleted** (hidden, `ARCHIVED —` prefix, moved to
>     an archive strip). **Corrects PR #112's finding that
>     `1306:7149` "renders nothing"** — the COMPONENT_SET is hidden, but both
>     variants are fully populated (100/102 children, 111 text nodes each), so
>     no fallback was needed. Sidebars (Trends/Fixtures/Trending News/Suggested)
>     were deliberately not reflowed — placeholder content blocked on Decision
>     Log #6 with no Section 4 endpoint.
>   - **Message pillar rebuilt: 3 desktop + 3 mobile frames**, 4 legacy frames
>     archived, and **`Messages mobile window 3` converted to a real component**
>     (`Message — Conversation Actions Menu`, `5706:8270`) instanced onto the
>     mobile chat screen — **closing Decision Log #89's open item**. The
>     original desktop "no message page" conflated "no conversation selected"
>     with "empty inbox" (it showed 8 conversations beside empty-inbox copy);
>     now three distinct states. PR #112's `5648:8054` empty state was
>     **retained, not rebuilt** (already 390px, already 31/31 bound).
>   - **Colour audit, measured**: Message pillar went from 385 paints / 368
>     bound (95.6%) with real off-palette `#1e1e1e`, `#a1584a`, `#d9d9d9` ×13,
>     to **470 paints / 466 bound (99.1%) and zero off-palette hexes**. Across
>     the whole delivery: **945 paints, 939 bound (99.4%)**; the only 6 unbound
>     are the shared Navbar's avatar `[IMAGE]` fill (component debt, not
>     editable from an instance). **0 `brand/green-tint-28`**, **0 new colours**,
>     **0 frame overlaps**.
>   - **Real bugs found and fixed**: the window-3 menu had no usable background
>     and went unreadable over any scrim; its row highlight was navy-on-navy;
>     and 27 auto-layout rows were silently frozen at 100px. **New file-wide
>     authoring gotcha worth knowing: a variable-bound paint takes its alpha
>     from the variable, not from the paint's own `opacity`** — binding
>     `brand/navy` to a paint set at 30% yields a fully opaque paint. Use a
>     token that carries its own alpha (`brand/green-tint` 12%,
>     `color/icon/inactive` 15%), or re-apply opacity to a copy of the paint
>     *after* binding. A "0 unbound paints" audit can pass while a paint still
>     renders at the wrong alpha.
>   - **Flagged, not fixed**: three Settings desktop leaves
>     (`2926:8764`, `2926:8996`, and the `2926:9721`/`2927:9954`/`2927:10205`
>     trio) carry *structural* content leakage — whole rows with live controls
>     copy-pasted from the wrong screen, plus overlapping duplicate headings.
>     Fixing them is layout surgery on built screens (`figma-design-system`'s
>     domain) and needs a product decision on what belongs there, so **desktop
>     and mobile deliberately diverge on those three screens** until resolved.
>   - **Founder calls open**: which Message frames are canonical (nothing was
>     deleted, same shape as the homepage's Decision Log #46 situation), and
>     whether the archived Community/Message frames should now be deleted
>     outright.
>   - Not merged — same standing instruction every design-stage PR follows.
