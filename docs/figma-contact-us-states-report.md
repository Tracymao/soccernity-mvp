# Figma: Contact Us form states, 2026-10-30

Branch `design/contact-us-states`, from `origin/main` `2bbf17f` (PR #552, the Contact Us backend, and PR #548, the form-notice wording, are both merged). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Screenshots: `docs/figma-contact-us-states-screens/`.

## 1. What the four existing frames already showed

Read live: Contact Us Desktop Logged In `6113:14053`, Logged Out `6113:14199`, Mobile Logged In `6115:14611`, Logged Out `6115:14684`; Contact Category Dropdown `6130:14653` (desktop) / `6130:14664` (mobile), six options.

| State | Existing frames |
|---|---|
| Empty form (Name, Email, category, Subject, message, Submit) | yes, all four |
| Category dropdown open | yes, as the two components (not on a page frame) |
| Logged-in Name and Email prefilled | **no**, the logged-in frames showed the same empty placeholders as logged out |
| Per-field validation errors | no |
| Submitting | no |
| Success | no |
| Rate-limited | no |
| Generic server error | no |
| Notice line under the form | no |

## 2. What was added

**12 new frames** in a clear area directly below the existing Contact Us row (desktop 3 columns, x -19926 / -18286 / -16646, y -27050 and -24350; mobile row y -21700, x step 590). Built on auto-layout; the navbar, hero banner, "Contact Us" title, footer and category chevron are clones of the existing nodes, so their bindings are inherited.

| Frame | Desktop | Mobile (390px) |
|---|---|---|
| Logged Out, Validation errors (all five fields) | `6884:31883` | `6886:32370` |
| Logged In, Validation errors (prefilled) | `6885:31869` | `6886:32485` |
| Logged Out, Submitting | `6885:32076` | `6886:32603` |
| Logged Out, Rate limited | `6885:32263` | `6886:32703` |
| Logged Out, Server error | `6885:32453` | `6886:32806` |
| Logged Out, Success (replaces the form) | `6885:32643` | `6886:32909` |

- **Validation:** an invalid field gets a `semantic/alert` border and, under it, the file's existing inline error style (3px `semantic/alert` accent bar plus short navy text, as on the Guardian Withdrawal 400 frames). The alert colour is used only as an accent bar and border (Decision Log #408 item 4). Logged out shows all five errors (the email shows a typed value, `adeniyi@`, with the invalid-address error); logged in shows Name and Email prefilled and valid, and errors on category, subject and message.
- **Submitting:** values filled, the fields at 70% opacity, the button reads "Sending…" at 60% opacity.
- **Rate limited and server error:** values kept, one alert row above Submit.
- **Success:** replaces the form (tick disc, heading, one line, one button). "Send another message" has a prototype link back to the empty logged-out form (`6113:14199` / `6115:14684`).
- States 3 to 6 are drawn once per breakpoint, on logged-out chrome, because the form content is identical logged in or out (Name and Email are filled either way); only the navbar differs. Logged-in prefill is shown on the validation frames.

**Edits to the four existing frames** (the only changes to existing nodes; a before/after geometry diff of every descendant found nothing else moved):
1. The notice added under Submit, then the green form panel, the footer and the frame height grew to fit (desktop +89px, mobile +129px).
2. Logged-in frames: Name and Email now show prefilled sample values in the primary text colour (they showed empty placeholders). Editable by definition, same field style.

## 3. Strings

**The notice (exact, from `docs/legal-copy-draft-tos-privacy-policy.md`, Part C, "Screen copy -- Contact Us form notice"):**

> Soccernity staff read the messages sent through this form. We keep your message for 12 months after the last message in the enquiry and then delete it automatically; if it raises a safeguarding concern or a complaint, it may be kept for longer as part of a report or case record. See our Privacy Policy.

Tagging: the source tags both sentences `[COPY PENDING LEGAL REVIEW]`. In Figma the tag is a visible `Copy Tag` chip (a clone of the one on the Guardian Withdrawal frames) above the notice, and the text layer is named `[COPY PENDING LEGAL REVIEW] Contact Us form notice`. One chip covers both sentences. "Privacy Policy" is underlined and set in the primary colour, as a link would be. The notice is drawn on the form states, not on the success state (the form is gone).

**New strings (all plain, no legal claim, no promise of a reply or a reply time; none tagged):**

| Where | String |
|---|---|
| Name error | Enter your name. |
| Email error | Enter a valid email address. |
| Category error | Choose a category. |
| Subject error | Enter a subject. |
| Message error | Enter a message. |
| Submitting button | Sending… |
| Rate-limited alert | Each person can send a limited number of messages in an hour. You can send another later. |
| Server-error alert | Something went wrong and your message wasn’t sent. Try again. |
| Success heading | Message sent |
| Success line | Thank you for getting in touch. |
| Success button | Send another message |

Sample values only (not copy): Adeniyi Christiana, adeniyi@example.com, Technical issues, "Live score not updating", "The live score for the Chelsea match stopped updating in the second half."

## 4. Checks

- Top-level nodes on page `0:1`: 1,032 to 1,044 (the 12 new frames); hash of the original 1,032 ids unchanged (`3176792416`); nothing deleted or archived.
- Authored paints on the 12 new frames: 212 solid, 212 variable-bound, 0 unbound, no `brand/green-tint-28`, no new colour. Excluded as inherited clones: the navbar instance (its avatar `IMAGE` fill), the hero banner's `IMAGE` fill, the footer, the Copy Tag chip, the category chevron.
- Radii, paddings and gaps are bound to `Soccernity Spacing & Radius` variables where a variable of that value exists.
- Overlaps: 0 against every top-level node; geometry diff on the four edited frames: only the panel, its group and the two prefilled text widths changed.
- Light mode; mobile frames are 390px; screenshots of each new state and of the edited frames were read, not only counted.
- No test suite applies (Figma and docs only).

## 5. Follow-ups, not fixed

1. **The API's rate-limit wording differs from the brief's.** `contact.constants.ts` sends "Each **email address** can send a limited number of messages in an hour. You can send another later." (3 per email per hour); the frames use the brief's "Each **person** …". The frames and the code should say the same thing; either is a one-word change. There is also a second 429 from the shared per-IP `@AuthRateLimit()` and the global limiter, with the generic throttler body; no frame draws that wording.
2. **Maximum-length errors are not drawn.** The endpoint caps name 200, email 254, subject 200 and message 500 characters, and the frames show no counter (the original frames do not either). A person typing past 500 characters has nothing telling them why.
3. **Mobile placeholder typo, left as found.** The existing mobile message field reads "Email Subject" (a copy of the subject field's placeholder). The new mobile frames use "Enter your message here". Labels also differ between breakpoints on the existing frames ("Email" / "Email Address", "Choose a category" / "Select Category"); the new frames keep each breakpoint's own wording.
4. **The Privacy Policy link in the notice is not wired.** A range inside a text layer cannot carry a prototype link; the code needs `/privacy`.
5. **The open category dropdown** exists only as the two components; no page frame shows it open, and the new frames do not wire an overlay to it.
6. **F2 components were not used.** The Field, Button and Banner components use Inter, 14px type and radius 6/8/12; the Contact Us form is Montserrat, 24px type, radius 12 and a 1030px field, so adopting them would change the look (same finding as pass G2). The fields, the alert row and the buttons are local frames with the same bindings.
7. **Submitting has no spinner**, only the label and the dimming. Whether a disabled-state token is wanted is a design-system question.
8. **Inherited, not changed:** the mobile footer's social labels wrap ("face boo k") on every mobile frame that carries the footer, as on the existing mobile frames; the notice text is 70% navy, small (11px on mobile), the file's known muted-text contrast question.
9. The notice is `[PROPOSAL, not yet built]` like the form's endpoint front end; `apps/web` has no Contact Us page yet.

## 6. Disclosures

- Another session was editing the shared checkout (`services/api/src/modules/contact`, `account-hold`, `moderation`) and switched it to a different branch while I worked. I did not touch its files; the commit was made from a separate worktree (`../soccernity-contact-states`), and only the files named in this PR were added.
- A first build call failed on a variable-mode lookup (the spacing collection has its own mode id); the run rolled back atomically and was retried with a mode-agnostic lookup. No stray nodes were left.
