# Social sign-in removed from Figma (Decision Log #479)

Figma and docs only. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No application code, legal text, `.docx`, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. No suite run. Nothing was deleted: everything is hidden and renamed with the file's `ARCHIVED — … (#479)` convention.

Source: `docs/figma-b085-social-sign-in.md` (the B-085 pass this reverses). Decision Log #479 removes Google and Facebook sign-in completely; this pass only brings the Figma file in line.

## 1. The four social blocks on Login and Register

Each block (`Social Sign-In`) was a VERTICAL auto-layout frame holding Divider, Google, Apple (already archived by #378) and Facebook. In every block the Divider, Google and Facebook children are now hidden and renamed; the block container itself is hidden and renamed too.

| Frame | Frame id | Block id | Divider | Google | Facebook | Apple (unchanged, #378) |
|---|---|---|---|---|---|---|
| Login desktop | `407:844` | `5418:7075` | `5418:7076` | `5418:7080` | `5418:7092` | `5418:7088` |
| Login mobile | `1625:2303` | `5418:7141` | `5418:7142` | `5418:7146` | `5418:7158` | `5418:7154` |
| Register desktop | `407:1051` | `5418:7097` | `5418:7098` | `5418:7102` | `5418:7114` | `5418:7110` |
| Register mobile | `1625:2333` | `5418:7163` | `5418:7164` | `5418:7168` | `5418:7180` | `5418:7176` |

Names now read `ARCHIVED — Or continue with divider (#479)`, `ARCHIVED — Continue with Google (#479)`, `ARCHIVED — Continue with Facebook (#479)`; the blocks read `ARCHIVED — Social Sign-In (Google, Facebook, divider; Apple archived #378) (#479)`.

**About "close the auto-layout up".** Hiding all children of a hug-sized auto-layout frame did not collapse it: Figma kept a leftover height (52 px desktop, 46 px mobile) even after re-asserting `primaryAxisSizingMode = AUTO`. The blocks have no fill, stroke or effect, so nothing rendered either way, but I archived the empty containers as well so no phantom box remains. The blocks sit in absolute-layout `Left Side` frames and nothing is positioned relative to them, so no other element moved.

**Visible gap, left as is.** The "Don't have an account? Create one here." / "Already have an account? Log in" lines, and on desktop the spacing node above them, keep their original positions, so there is now an empty band where the buttons were (about 130 px on mobile, 150 px on desktop). Moving them was not asked for and would mean resizing legacy absolute-layout frames. See the screenshots; a later pass can pull them up if wanted.

## 2. The seven B-085 frames and the note

Hidden, renamed `ARCHIVED — <old name> (#479)`, all still at y 206000 (note at y 205652) and still children of the page. Child counts match the figures recorded in the B-085 report (39, 101, 30, 33, 27, 30, 27), so nothing inside them changed.

| Node id | Frame |
|---|---|
| `6965:46142` | Login — Social buttons hidden (no provider enabled) — Mobile |
| `6965:46204` | Register — Social buttons hidden (no provider enabled) — Mobile |
| `6966:46142` | Social sign-in — Enter your email (Facebook, no email) — Mobile |
| `6966:46212` | Social sign-in — Enter your email — Invalid email — Mobile |
| `6966:46289` | Social sign-in — Cancelled (Facebook) — Mobile |
| `6966:46362` | Social sign-in — Provider refused or failed (Facebook) — Mobile |
| `6966:46438` | Social sign-in — Next step: confirm your age (hand-off to Age Gate) — Mobile |
| `6968:46142` | NOTE — B-085 social sign-in states (text node) |

The prototype links set on those frames (to Verify Email prompt `6750:29531`, Age Gate `5539:7264` and Login mobile `1625:2303`) are untouched; they stay inside the archived frames. No other frame links to them (checked in the B-085 pass; nothing was added since).

## 3. Standing check (Decision Log #404 item 14)

| | Before | After |
|---|---|---|
| Top-level nodes on page `0:1` | 1,737 | 1,737 |
| djb2 hash of the top-level ids, in order | 3139070938 | 3139070938 |

Ids unchanged and in order, so no node was added, removed or reordered. The per-top-level `findAll` count was taken for the twelve touched top-level nodes only (a full per-node count across about 37,600 text nodes' worth of frames was not run); after: Login desktop 239, Register desktop 303, Login mobile 61, Register mobile 123, B-085 frames as above. No before-counts exist for the four Login/Register frames (they were not read before the edit), but only `visible` and `name` were written, so the structure cannot have changed.

A page-wide text search (37,615 text nodes) for "Continue with Google/Facebook", "Or continue with" and "Sign in with …" found them only inside the four blocks above and the archived B-085 frames. The other hits are unrelated ("indexed by Google" in the guardian consent copy, "continue without joining" in the Club Picker, the Terms/Privacy effective-date line) or pass A notes (`6628:22212` to `6628:22215`, which mention the Apple button and B-005).

## 4. Paint audit

Only visibility and names were written; no fill, stroke, effect, position or size was changed, so no paint was added. Read-back of visible solid paints on the four edited frames (hidden subtrees skipped):

| Frame | Visible solid paints | Unbound | Unbound and black |
|---|---|---|---|
| Login desktop `407:844` | 181 | 12 | 0 |
| Register desktop `407:1051` | 190 | 12 | 0 |
| Login mobile `1625:2303` | 20 | 0 | 0 |
| Register mobile `1625:2333` | 28 | 0 | 0 |

The 24 unbound paints are on the two desktop frames and were not touched; they are not in the removed blocks (those subtrees are skipped). I did not trace which nodes they are; earlier reports record the goalkeeper illustration's skin and hair tones as deliberately unbound. No `brand/green-tint-28`, no new colour.

## 5. Screenshots

`docs/figma-social-removal-screens/`: `before-` and `after-` for `login-mobile`, `register-mobile`, `login-desktop`, `register-desktop`. After: Google, Facebook and the divider are gone on all four; the Log in and Create account buttons and the account-switch lines are in their original places.

## 6. Not done, recorded

1. The empty band above the account-switch line (section 1).
2. The pass A notes (`6628:22214`, `6628:22215`) still describe the hidden Apple button; they are history and were left alone.
3. `docs/figma-b085-social-sign-in.md`, the register rows B-084/B-085 and the Decision Log pointer for #479 were not edited (docs-only instruction for this PR).
4. The built social sign-in code is a separate removal (the backend PR #701 on `main` is its own change); nothing here touches it.
