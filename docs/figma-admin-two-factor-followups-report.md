# Figma: Admin Console two-factor follow-up frames (B-271)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal text, DPIA, Build Plan docx or `docs/build-register.md` was changed. Written for the frontend agent that codes these screens in `apps/admin`.

Follows `docs/figma-admin-two-factor-report.md` (PR #573), whose sections 4 and 6 listed what was not drawn. Built from the F2 components (Button, Pill, Field, Callout, Banner, Note, Dialog) and cloned from the PR #573 frames; light mode, `Soccernity Theme` variables, no new colours. Nothing existing was edited, archived or deleted.

## 1. What was built

9 frames (1440 wide, desktop, light mode), a section title and description, and 6 Notes, in one clear band below the previous pass (y 133,400 to 137,412, x 0 to 8,000).

- Row 1 (y 134,000): the full **Edit admin** page, 4 states.
- Row 2 left (y 136,000): the **staff list** with a two-factor On / Off column.
- Row 2 right (y 136,000): the **admin profile two-factor card with enforcement off**, 4 states.
- Notes below each group.

Frame heights: the Edit admin frames are 1,365 to 1,451 px because four cards no longer fit the 1,184 floor; the `Admin Shell` instance was resized to match, as on the earlier 1,530 frames, and Settings stays pinned to the sidebar bottom. The other frames are 1,184.

## 2. Node ids

### Edit admin (full page), all cards as built in `EditRolePage`

| State | Node id | Size |
| --- | --- | --- |
| 1 Two-factor on, Reset enabled | `6907:34127` | 1440 x 1385 |
| 2 Two-factor not turned on, Reset disabled with a reason | `6908:34249` | 1440 x 1365 |
| 3 Confirm reset dialog (over state 1; F2 `Dialog` Tone=Alert instance) | `6908:34407` | 1440 x 1385 |
| 4 Reset done (Info banner; card back to Off, Reset disabled) | `6908:34466` | 1440 x 1451 |

Card order, following `RoleFormPages.tsx`: Account (Name, Email, Role, Submit), Account status, Two-factor authentication, Child safety vetting. The Role control is a native `<select>` in code; it is drawn as an F2 `Field` with a ▾ glyph in its value (the glyph pattern the dialog close button already uses). The Account, Account status and Child safety vetting wording is copied from the code and is not new.

Base frames: `6902:33251` (page shell and card style), `6902:33382` (scrim and dialog), `6902:33682` (the reset-done banner). The earlier simplified Edit admin frames (identity card plus two-factor card only) are unchanged.

### Staff list

| Frame | Node id | Size |
| --- | --- | --- |
| Staff list ("Roles") with Two-factor column | `6909:34859` | 1440 x 1184 |

Columns: NAME, ROLE, STATUS, TWO-FACTOR, ACTIONS. Sample rows (names are samples, not real people): five staff, three with two-factor On and two Off, one deactivated. "Add Role" is drawn disabled (as in code, Decision Log #191). The legacy Roles frame `1658:2303` (absolute layout, mixed sample data) is the base the code names; it was not edited, and the new frame follows the page structure of `SettingsRolesPage.tsx` on the shell, using the incorrect-details table (`6737:27868`) for the table style.

### Admin profile, enforcement off

| State | Node id |
| --- | --- |
| 1 On, Regenerate backup codes and Turn off two-factor | `6906:33681` |
| 2 Turn off, password dialog | `6906:33808` |
| 3 Turn off, incorrect password | `6906:33959` |
| 4 Turned off, done | `6906:34113` |

The enforced state `6902:32565` (no Turn off, "required" callout) is unchanged. The dialog is the local-frame dialog of `6902:32938` (as the regenerate dialog) with an F2 Alert `Callout` added.

### Section and notes

Section title `6910:34754`, description `6910:34755`. Notes (F2 `Note` instances): Edit admin card order `6910:34756`, Edit admin copy pending `6910:34761`, Edit admin API drivers `6910:34766`, staff list column `6910:34769`, profile enforcement off `6910:34772`, profile enforcement off copy pending `6910:34777`.

## 3. Frame to API field / response mapping

Two API changes are said to land in a backend PR in the same batch; they were not on `origin/main` when this was drawn and were not verified in code.

| Frame(s) | Driven by | Notes for the build |
| --- | --- | --- |
| Edit admin 1 (card On, Reset enabled) | `twoFactorEnabled: true` on the staff item (`GET /admin/staff`, new field); `POST /admin/staff/:id/two-factor/reset` (superadmin only) | The card knows only on/off from the list item; the staff API gives no backup-code count, so none is shown. |
| Edit admin 2 (Off, Reset disabled) | `twoFactorEnabled: false` | The disabled button and the reason line replace the 409 round trip. A 409 `two_factor_not_enabled` can still happen if the list was stale; the existing frame `6902:33532` draws it. |
| Edit admin 3 (confirm dialog) | Same route | Wording unchanged from `6902:33382`. |
| Edit admin 4 (done) | 200 `{ id, twoFactorEnabled: false }` | The dialog closes, an Info banner confirms, the card flips to Off. Ends every session of the target; writes audit action `admin_user.two_factor_reset`; sends no email. |
| Account / Account status / Child safety vetting cards | `PATCH /admin/staff/:id/role`, `PATCH /admin/staff/:id/status`, `PATCH /admin/users/:id/child-safety-vetting` | As built; drawn for the page layout only. |
| Staff list, TWO-FACTOR column | `twoFactorEnabled` on each `GET /admin/staff` item (new field) | On = Positive pill, Off = Neutral pill; the word is always shown, not only the colour. |
| Profile 1 (enforcement off, card) | `GET /admin/auth/two-factor/status` with `enforced: false` (new field), plus `enabled: true` and `backupCodesRemaining` | Backup codes remaining is drawn. The card does not say two-factor is required. |
| Profile 2 (password dialog) | `POST /admin/auth/two-factor/disable { password }` | 204 on success. While `enforced` is true the same route answers `403 admin_two_factor_required`, which is why the enforced state has no Turn off. |
| Profile 3 (incorrect password) | `401` message `Incorrect password` (`two-factor.service.ts`) | Shown on the password field, as on the regenerate dialog. |
| Profile 4 (done) | 204 | The card shows Off with no actions; an Info banner confirms. |

## 4. Wording tagged for counsel

Every new string about authentication carries the `Copy Tag` chip `[COPY PENDING LEGAL REVIEW]` on the card (the pass convention), and the two Notes `6910:34761` and `6910:34777` list them.

Edit admin: "This admin has two-factor authentication turned on.", "This admin has not set up two-factor authentication.", "Reset is not available: this admin has no authenticator app or backup codes to remove.", "On", "Off". The reset text, dialog and banner are the earlier tagged wording, unchanged.

Profile, enforcement off: "Turn off two-factor", "Turn off two-factor authentication?", "Enter your password to confirm.", "Turning this off makes your account less secure.", "Turn off", "Incorrect password" (the API message), "Two-factor authentication turned off", "Your account now signs in with your password only. Your backup codes no longer work.", "Two-factor authentication is off. Signing in needs only your password.", "Off". Adapted from the user-side turn-off frames `6711:27333` and `6712:27465`.

Not tagged: the staff list column header "TWO-FACTOR" and the existing Account, status and vetting wording.

The frontend agent should add `docs/pending-copy-manifest.md` rows when coding. "Your backup codes no longer work" assumes turn-off deletes the backup codes (`UserBackupCode` / `AdminBackupCode`, per the module README); confirm before the wording is final.

## 5. Not drawn, undecided

1. **Turning two-factor back on from the profile** (after Turn off, or when the card shows Off) is not drawn. The done frame has no action. It needs the enrolment screens; the sign-in enrolment frames `6899:32468` to `6899:32759` are the pattern. Founder to decide whether it is needed.
2. **Card order on Edit admin** follows the code (two-factor after Account status, before Child safety vetting). It is a judgment call; founder to confirm.
3. **Edit admin for your own record** with the full layout is not redrawn; `6902:33820` (simplified layout) still shows the own-account case.
4. **Staff list:** no filter by two-factor status, no load-more or empty or error states (they exist in code as plain text and were not part of this ask).
5. **Profile enforcement off:** no low-backup-codes warning (no threshold is decided); Turn off and Regenerate are both Secondary buttons because the F2 set has no destructive or text-weight variant at Medium size, and no destructive token exists (non-negotiable 3).
6. **Disabled Reset reason** is a static line; if a 409 still comes back from a stale list, use `6902:33532`.
7. No prototype links were added: the pass C and PR #573 frames carry none.

## 6. Self-checks

Measured by a node walk over every new top-level node, with the standing count and id-hash check (Decision Log #404 item 14):

- Top-level nodes on page `0:1`: **1,082 to 1,099** (9 frames, 2 section texts, 6 Notes). Hash of the original 1,082 ids unchanged (`2515121069`, same before and after, djb2 over the ids in order); no node deleted, archived or edited. The first 1,082 ids are those left by PR #573 and everything before it.
- Paints: 1,070 solid paints bound to variables; **0 unbound on authored nodes**. 9 unbound solids are inherited: `Rectangle 223` inside each `Admin Shell` instance (the shell's literal sidebar wash, Decision Log #199). 9 image fills are the shell avatar. Three default-filled auto-layout frames named "Actions" that I created were found by the audit and fixed (fills cleared) before the final count.
- Overlaps: 0 against every other top-level node on the page.
- Node names: no default names on authored nodes. Names such as `Group 826`, `Rectangle 110`, `Rectangle 223`, `Ellipse 30` exist inside the inherited `Admin Shell` instances and were not renamed.
- Frame sizes: all 1,440 wide; heights 1,184 (profile frames, staff list) or 1,365 to 1,451 (Edit admin, four cards). None below the 1,184 floor.
- Contrast: every new text and fill uses the existing F2 components and token pairs (Pill Positive and Neutral, Callout Info and Alert, Banner Info, disabled Primary button, secondary text on white), already computed in the PR #573 report (secondary text 5.0:1 on white; navy 12.6:1; white on navy 12.6:1). I did **not** recompute the Neutral pill "Off" label separately; it is the same tone and pair as the "Pending" pill on the incorrect-details frame. The alert colour is used only as a bar or outline (non-text).
- Visual checks (screenshots read): Edit admin 1, 3, 4, staff list, profile 1, 3, 4, and one Note. Edit admin 2 was checked through frame 4 (its card state is identical) and profile 2 through profile 3 (identical except the error). Edit admin 1 had a stray "Helper text" line under the Role field, which was hidden before frames 2 to 4 were cloned.
- Not verified: a real browser rendering of the built `apps/admin` screens (nothing is coded); the new API fields (`enforced`, `twoFactorEnabled`) were not checked against the backend.

## 7. Notes for the frontend agent

- Edit admin reads two-factor state from the staff list item, so `EditRolePage` needs the new field in its router `state` handoff as well as the fallback list fetch.
- Hide Turn off while `enforced` is true; the enforced card is `6902:32565`.
- The Role field is a native select in code; the Figma field is a drawing of it.
- Register: this pass does not edit `docs/build-register.md`. B-271's Figma follow-up is done by this pass.
