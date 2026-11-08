# Figma W8 pass 3: report a message, read receipts, public profile, Block colour, Bants remove topic (Decision Log #472)

Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, Decision Log, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Date: 2026-11-08. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, 390 px mobile and 1440 px desktop as the neighbouring frames. Founder decisions of 2026-11-08 (report a message, read receipts, public profile, Block stays red). The matching backend rules are R46 (report a message), R47 (read receipts) and R48 (public profile), which this pass could not read from the repo (no such files on `origin/main`); the frames follow the brief.

Written for: the `figma-to-code` agent that builds these next and the founder who reviews the frames.

## 1. Node map

Everything is in a clear band below all existing content (existing content ended at y 269,603): y 270,800 to 299,611, x 0 to 8,600. Every frame is a clone of a real frame plus additions (nothing is edited in place), with a text label 48 px above it (label ids are the `Label — …` text nodes; they follow each frame in creation order). The band title is `7018:59162`.

### R: Report a message (clones of the B-284 in-app report form; reasons are the nine existing categories, read from the frames)

Mobile, y 271,100, 390 wide, pitch 510. Base frames `6946:40823`, `6946:40892`, `6946:41241`, `6946:41387`, `6946:41311`.

| Id | Frame | State |
|---|---|---|
| R1 `7011:56930` | Report a message — Mobile — 01 Nothing chosen | title "Report this message", nothing chosen |
| R2 `7011:56982` | … 02 Reason chosen, details empty | one reason chosen, details optional |
| R3 `7011:57035` | … 03 Sending | "Submitting…" |
| R4 `7011:57088` | … 04 Sent | "Reported — thanks / Our team will review it." |
| R5 `7011:57096` | … 05 Could not send | error line, what was typed is kept |

Desktop, y 272,300, 560 wide, pitch 680. Base frames `6946:40232`, `6946:40301`, `6946:40650`, `6946:40796`, `6946:40720`.

R6 `7011:57155` nothing chosen · R7 `7011:57207` reason chosen · R8 `7011:57260` sending · R9 `7011:57313` sent · R10 `7011:57321` could not send.

Admin Moderation report detail for a message target, y 273,700, 1440 wide, pitch 1620 (clones of `6947:41119`, the report detail with a reason category):

| Id | Frame | What changes |
|---|---|---|
| R11 `7011:57380` | Admin — Report Detail — Message target | Type "Message", Sender, Sent time, "Message text" with the message |
| R12 `7011:57551` | … Message target, edited | adds an "Edited" line and an "Original text (before the edit)" block under the current text |
| R13 `7011:57728` | … Message target, deleted by the sender | adds "Message status: Deleted by the sender at 08:20"; the text is kept for review |

The "Report" item itself on the other person's message is frame A3 `6977:47201` of `docs/figma-w8-messaging.md`; it does not appear on your own message, so no frame for that is drawn. The reported message's text is shown to admins only; nothing in these frames sends it to the other person.

### S: Read receipts (Settings > Privacy > Direct Messages, row now live; "Who can message me" unchanged)

Desktop (1440 × 2517, y 275,500, pitch 1540; bases `6981:48879`, `6981:49426`): S1 On `7012:57260` · S2 Off `7012:57309` · S3 Saving `7012:57356` (toggle dimmed, "Saving…") · S4 Save failed `7012:58176` (banner, toggle back to Off) · S5 Loading `7012:57459` (row skeleton plus the existing option skeletons).
Mobile (390, y 278,500, pitch 450; bases `6981:49593`, `6981:49717`): S6 On `7013:57948` · S7 Off `7013:57992` · S8 Saving `7013:58038` · S9 Save failed `7013:58083` · S10 Loading `7013:58132`.

The description under the row states the rule once: "When this is on, people you message can see when you’ve read their messages. “Seen” only shows when you and the other person both have read receipts on." The old "Learn more" link and the "not shown on message requests" sentence were removed (no such page or concept exists). Row title colour is now the live-row primary colour.

### V: the Seen label in the conversation (y 280,000)

V1 `7014:57981` mobile conversation with "Seen 08:09 AM" under my latest message (base `5709:8419`) · V2 `7014:58025` the same with no label (not read yet, or receipts off for either person) · V3 `7014:58068` desktop chat pop-up with the label · V4 `7014:58112` pop-up with no label. The label is only under messages I sent, never under a message received. The pop-up (388 × 540, `elevation/overlay`) is drawn standalone: the old Community "Chat Window" `1456:8885` is a lorem-ipsum absolute layout, not a usable base.

### PP: Public profile toggle (Privacy, Adult variant)

Desktop (y 281,500, bases `6991:53454`): PP1 On `7014:58155` · PP2 Off `7014:58249` · PP3 Saving `7014:58345` · PP4 Save failed `7014:58440` (banner, toggle back to On).
Mobile (y 284,500, base `6991:55384`): PP5 On `7014:58537` · PP6 Off `7014:58625` · PP7 Saving `7014:58715` · PP8 Save failed `7014:58804`.
The row description is the existing wording ("When this is off, only people who follow you can see your profile, posts, and activity.").

### PV: the profile as it looks with a private profile

| Id | Frame | State |
|---|---|---|
| PV1 `7015:58577` | Other User — Private, seen by a non-follower — Mobile (y 286,500; base `6669:27188`) | public name, avatar, "This profile is private", Follow. Hidden: bio, country, counts, tabs, posts, Message and More |
| PV2 `7015:58666` | Own — Private profile note — Mobile (base `6747:29642`) | one small line under the bio |
| PV3 `7015:58735` | Post — Not available to a non-follower … — Mobile (base `6738:30526`) | the ordinary "Page not found" |
| PV4 `7015:58744` | same — Desktop (base `6738:30391`) | same |
| PV5 `7015:58750` | Other User — Private, seen by a non-follower — Desktop (y 287,800; base `6747:28894`) | same as PV1; the cover photo is replaced by the neutral tinted band |
| PV6 `7015:59532` | Own — Private profile note — Desktop (base `6747:29094`) | one small line |

The follower view is the normal profile with no extra mark: the existing other-user frames (mobile `7016:60071`, desktop `7016:59292`, see BL below).

### BL: Block shown in the shipped red (y 292,000)

BL1 `7016:58904` conversation menu, mobile (clone of `6978:47532`) · BL2 `7016:60071` other-user profile with the open menu, mobile (clone of `6669:27188`) · BL3 `7016:59066` conversation menu, desktop (clone of `6979:48927`) · BL4 `7016:59292` other-user profile, desktop (clone of `6747:28894`, y 292,000, x 2,440). The Block text and its icon are bound to `semantic/alert` (`#FA0606`); the menu background and the other icons are unchanged.

### BR: Bants remove topic (the "no endpoint" banner removed; y 296,000 mobile, y 297,200 desktop)

Mobile: BR1 default `7016:60157` · BR2 removing `7016:60243` (chip dimmed, cross disabled) · BR3 could not remove `7016:60329` (chip stays, one line under the chips). Desktop: BR4 `7016:60416` · BR5 `7016:60582` · BR6 `7016:60748`. Clones of `6999:56133` and `7002:57898`.

### Notes (y 299,300)

`7018:59163` report a message · `7018:59174` read receipts · `7018:59185` public profile · `7018:59197` Block colour and Bants.

## 2. Corrected, archived

Archived (renamed `ARCHIVED — … (superseded by W8 …)` and hidden; nothing deleted, nothing moved), after a screenshot comparison of the replacement with the original (BL1 and BL2 compared by eye; BL3 and BL4 and BR1 to BR6 come from the same code and were not compared one by one; the desktop BR6 and the mobile BR3 were viewed):

* Block: `6978:47532`, `6979:48927`, `6669:27188`, `6747:28894` (replaced by BL1 to BL4). Four, not six: C3 `6978:47660` and the Blocked-users frames contain no Block menu item.
* Bants: `6999:56133` (M19) and `7002:57898` (desktop twin), replaced by BR1 and BR4.

Re-pointing: a page-wide scan of all reactions (202,309 nodes, 1,635 carrying reactions) found no prototype link into any of the six. The only dependency was a flow starting point on `6669:27188` ("Flow 12"), now on `7016:60071`. Cloning a frame that is a flow start copies the start, so 13 starts inherited by my new clones were removed again (clones `7014:58345`… and the others); only `7016:60071` was kept.

Not edited: the other-user profile menus in the already-archived K-pass frames, `6738:30391` / `6738:30526` (reused as the post-not-available frames, unchanged), the messaging frames A1 to A7 and C1 to C4 (kept as they were; their Block item is superseded by BL1 and BL3), and every Bants frame other than M19 and its twin.

## 3. Wording: existing versus new

Taken from existing frames, unchanged: the report form title block, the nine reason labels, "Tell us what’s wrong. Our team will review it.", "Reported — thanks", "Couldn’t send your report", the Who can message me block, the Public profile description, "Couldn’t save your change. Your setting is back to what it was.", "Page not found".

New wording in the frames (the sample messages are placeholders):

* Report: "Report this message", the sample details "This person keeps sending me insults after I asked them to stop." (counter 64 / 500); admin: "Report #1051", "Message", "Sender", "@matthew_amuloko (Matthew Amuloko)", "Sent", "2 Nov 2026, 08:05", "Message text", "Message text (current)", "Original text (before the edit)", "Edited", "Yes, at 08:09 (within the 15 minutes)", "Message status", "Deleted by the sender at 08:20", and the sample message texts.
* Read receipts: the description above, "Saving…", "Seen 08:09 AM".
* Public profile: "This profile is private", "Follow to see their profile, posts and activity.", "Only people who follow you can see your profile.", "Saving…".
* Bants: "Couldn’t remove the topic. Try again."
* Labels and notes (internal, not product copy).

Tagged `[COPY PENDING LEGAL REVIEW]` (the three sentences that say who is told or who can see something):

1. the read receipts description (S1 to S4, S6 to S9);
2. "Follow to see their profile, posts and activity." (PV1, PV5);
3. "Only people who follow you can see your profile." (PV2, PV6).

Not tagged: everything else (labels, errors, sample data). The existing Public profile description was not tagged on the earlier frame and was left as it was.

## 4. SCOPE OPEN (also on canvas)

1. Whether Remove Content, Warn User and Suspend User apply to a message report is not decided; the admin frames show the post and comment buttons unchanged.
2. Whether the Seen label stays when the other person replies (V1 draws it staying), and whether it shows a time or only "Seen".
3. Following is instant, so a private profile does not stop a determined viewer (backend R48 says so too).
4. A non-follower's Message and Block triggers on a private profile are not drawn; whether a non-follower may message follows the direct-message rules.
5. Whether a private person's posts disappear from the feed, search and Bants for non-followers is not drawn. A post link opened by a non-follower shows the same "Page not found" as a missing post (PV3, PV4); a "This profile is private" page there would reveal that the post exists.
6. Block now uses `#FA0606`, which measures about 4.1:1 on white (below 4.5:1 for normal-size text). The founder decision is to keep the shipped red. **Mismatch found:** `apps/web/src/pages/messages/actions/messageActions.css` still says the Block item is navy ("the nearest token is used: navy for the menu item"), and no colour for Block is set in `components/block/`. The brief says the shipped dialog is red; that could not be confirmed in the code.
7. Bants: removing a topic has no confirmation here; removing the last topic, a viewer's chips (no cross) and an under-16 creator are not drawn.
8. The desktop Read receipts toggle sits 12 px past the 533 px panel; that comes from the earlier frame and was not changed.
9. Marketing emails are not part of this pass (the row stays "Coming soon").

## 5. Standing check (Decision Log #404 item 14)

* Top-level nodes on page `0:1`: 1,630 before, 1,737 after (+107: 51 frames, 51 labels, 1 title, 4 notes). Hash of the ids of the 1,630 original nodes before and after: `1179855867`, identical (computed with the same djb2 loop on the ordered id list). Six originals were renamed, hidden and kept; none deleted.
* Authored solid paints on the new nodes (instance internals excluded): 2,434; 8 unbound, all the inherited `Account Actions` frames inside the cloned Privacy panels (one per Privacy clone). 0 other unbound paints.
* Text: label and title texts are Inter or Montserrat as the earlier W8 labels; all product text is Montserrat or Inter as in its base frame.
* Overlaps: 0 among the new top-level nodes; none with existing content (the nearest existing content ends at y 269,603).
* Screenshots viewed: R5, R11 (edited), S3, S4, S5, S9, S10, V1, V3, PP4 (desktop panel) and PP8, PV1, PV2, PV5, BL1, BL2, BR3, BR6. The rest come from the same builder code and were not viewed one by one.
* Three problems found and fixed during the pass: the first save-failed frame cloned a base that already carried a banner (rebuilt from the default); the loading skeleton collapsed (sizes set after insertion); a clean-up call removed two labels I still needed (recreated), and one profile clone recoloured the menu background (rebuilt, only the Block text and icon are red).
* Prototype links: none added; none broken.
