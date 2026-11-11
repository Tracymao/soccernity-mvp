# Figma pass V - seventh Contact Us category "Appeal a suspension"

Date: 2026-11-11. Agent: figma-design-system (Figma and docs only).
Decision Log #492 (b), (f); build-register B-298 (the backend leg is merged as PR #732).
File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No application code, schema, legal text, Build Plan docx,
`docs/build-register.md` or `docs/pending-copy-manifest.md` was changed. The pass U email frames were not touched.

## 1. What was found (live scan, not memory)

* The Contact Us form frames **do not draw the category list at all**. They show a closed field ("Choose a category" on
  desktop, "Select Category" on mobile). The only places the list exists are two **absolute-layout components**,
  used as overlay destinations, with no instances before this pass:
  * `6130:14653` Contact Category Dropdown - Desktop (1030 wide)
  * `6130:14664` Contact Category Dropdown - Mobile (318 wide)
  Both held six rows: Technical issues, Editorial Complaints, Data, Suggestions, Enquiries, Feedback.
* The admin Contact enquiries frames (`6876:30850` list, `6876:31297` empty, `6876:31513` load error) draw the Category
  filter as a closed Field instance ("All", helper "Any category from the Contact Us form."). **No filter option list
  was drawn anywhere.** In the list rows and the enquiry detail frames
  (`6878:31198`, `6878:31438`, `6879:31526`, `6879:31599`, `6878:31683`, `7041:62132`) the category is **plain text, not a
  chip**; the sample values (Technical issues, Editorial Complaints, Suggestions, Data, Enquiries) are sample data, so
  nothing in them needed changing.
* The existing validation frames (`6884:31883`, `6885:31869`, `6886:32370`, `6886:32485`) show the empty category field
  with the error line "Choose a category."; the Submitting / Rate limited / Server error frames show "Technical issues"
  as a chosen value. None of them depends on the number of categories.

## 2. What changed

### 2.1 Existing components extended (the only existing nodes edited)

| Node | Change |
|---|---|
| `6130:14653` (desktop component) | Added row text `7049:63083` "Appeal a suspension" (y 415) and divider `7049:63084` "Line 6" (y 396), same 66 px row pitch, cloned from the Feedback row so font, size and fill binding are inherited. Component and Background resized 1030x396 to 1030x462; all dividers re-asserted at x 0, full width. |
| `6130:14664` (mobile component) | Added `7049:63085` "Appeal a suspension" (y 208) and `7049:63086` "Line 6" (y 198), same 33 px pitch. 318x198 to 318x231. |

The seven rows now read, in order: Technical issues, Editorial Complaints, Data, Suggestions, Enquiries, Feedback,
**Appeal a suspension** (last, as decided). Screenshots checked: `docs/figma-pass-v-screens/dropdown-component-*.png`.
No other existing node was edited, renamed, hidden or deleted.

### 2.2 New frames (7 top-level, all cloned from existing frames)

Desktop row at y -19400 (x -19926, -18286, -16646), mobile row at y -16700 (x -19926, -19336, -18746):

| State | Frame | Id |
|---|---|---|
| Open, desktop, logged out | Contact Us Desktop - Logged Out - Category open (Appeal a suspension) | `7050:63460` |
| Selected + helper, desktop, logged out | ... - Logged Out - Appeal a suspension selected (helper line) | `7050:63556` |
| Selected + helper, desktop, logged in | ... - Logged In - Appeal a suspension selected (helper line) | `7050:63739` |
| Open, mobile, logged out | Contact Us Mobile - Logged Out - Category open (Appeal a suspension) | `7050:63933` |
| Selected + helper, mobile, logged out | ... - Logged Out - Appeal a suspension selected (helper line) | `7050:64028` |
| Selected + helper, mobile, logged in | ... - Logged In - Appeal a suspension selected (helper line) | `7050:64123` |
| Admin list, Category filter open | Admin - Contact Enquiries - Tab (Category filter open, Appeal a suspension) | `7051:63458` (x 13120, y 118000) |

* **Open** frames place an instance of the updated dropdown component (`7050:63541` desktop, `7050:64013` mobile)
  directly under the field (6 px gap) as an overlay. The chevron is not rotated (the closed frames' chevron is a plain icon).
* **Selected** frames set the field value to "Appeal a suspension" and re-bind the text to the same fill the existing
  chosen-value frames use (`color/text/primary`, full opacity, copied from `6885:32194`), and add the **helper line**
  (section 3). Because the form is absolute-layout and the 60 px gap above Submit is too small, Submit, the existing
  retention notice, the footer and the form background were shifted down together: desktop +31 px (frame 2155 to 2186),
  mobile +71 px (frame 1487 to 1558). After each resize every direct child was compared with its expected y; one drift
  was found and fixed (the mobile Submit group, which my own drift loop first reset by mistake, then set back to its
  shifted y 953). Positions read back: desktop Submit 1637, notice 1717, footer 1872; mobile Submit 953, notice 997, footer 1140.
* **Admin open filter** adds an auto-layout menu `7051:63690` (280 wide, 322 high) under the Category control with
  eight rows: "Any category" plus the seven categories; "Appeal a suspension" is drawn highlighted (hover/selected).
  Rows `7051:63691`, `7051:63693`, `7051:63695`, `7051:63697`, `7051:63699`, `7051:63701`, `7051:63703`, `7051:63705`.
  Built from variables: surface fill `color/background/surface`, stroke `color/icon/inactive`, text `color/text/primary`,
  highlight `brand/green-tint`, padding `space/12` and `space/10`, radius `radius/md`, effect style `elevation/menu`,
  the Value text style of the existing field. No new colour.

### 2.3 States covered

| State | Desktop | Mobile |
|---|---|---|
| Closed | existing `6113:14199` / `6113:14053` (unchanged) | existing `6115:14684` / `6115:14611` (unchanged) |
| Open (7 options) | `7050:63460` + component `6130:14653` | `7050:63933` + component `6130:14664` |
| Selected + helper | `7050:63556` (out), `7050:63739` (in) | `7050:64028` (out), `7050:64123` (in) |
| Error | existing `6884:31883`, `6885:31869` (unchanged) | existing `6886:32370`, `6886:32485` (unchanged) |
| Admin filter options | `7051:63458` | n/a (admin is desktop only) |

The error state is unchanged on purpose: it shows "Choose a category." for an empty field and is the same whatever the
list contains. **Not drawn** (recorded, not decided): the open state for the logged-in frames (identical but for the
header), the helper line combined with a field error, the helper line in the Submitting / Rate limited / Server error frames.

## 3. Helper line (tagged)

Wording (exact): **Use the email address your Soccernity account is registered with so we can find it.**

* Shown only when this category is chosen, centred under the message box and above Submit, using the same
  pattern as the existing retention notice: a visible "Copy Tag" chip reading `[COPY PENDING LEGAL REVIEW]` and the
  sentence. Layer names: frame `Helper - Appeal a suspension (email)` (`7050:63735`, `7050:63929`, `7050:64119`,
  `7050:64223`), text `[COPY PENDING LEGAL REVIEW] Helper - Appeal a suspension`.
* Style cloned from the notice: desktop 16 px, mobile 11 px (wraps to two lines at 318 px), Montserrat, same fills.
* No new sentence other than the helper line was added. The category label itself is not tagged (a label, as
  decided in the brief).

## 4. Contrast (computed from variable values, not by eye)

| Pair | Ratio | AA (4.5:1 text) |
|---|---|---|
| Helper text (navy) on the form wash | 11.42:1 | pass |
| Copy Tag text on its chip | 10.47:1 | pass |
| Selected value "Appeal a suspension" (navy) on white | 12.58:1 | pass |
| Existing dropdown row text (secondary) on white, incl. the new row | 5.01:1 | pass (inherited from the existing rows) |
| Admin menu text on surface | 12.58:1 | pass |
| Admin menu text on the green-tint highlighted row | 11.42:1 | pass |

## 5. Checks

* **Top-level nodes on page `0:1`:** before **1,857**, after **1,864** (+7: the seven new frames). Nothing deleted.
* **Original ids:** the djb2 hash over the 1,857 original top-level ids is **2349371021 before and after**
  (computed over everything except the seven new frames), same order. The hash over all 1,864 ids is 3965481774.
* **Archived:** 95 top-level nodes whose name begins "ARCHIVED" before and after. No frame was archived, hidden or
  renamed in this pass (none needed replacing). Nested archived nodes were not counted separately; no existing node
  other than the two components was edited.
* **Overlaps:** 0 of the seven new frames overlap any other top-level node (AABB test against all 1,864).
* **Paints (authored nodes):** the new component rows and dividers (4 nodes, 1 bound paint each), the menu subtree
  (11 bound, 0 unbound), the four helper blocks (3 bound each), the four selected-value texts (1 bound each): **0 unbound**.
* **Paints (whole new frames vs their source frame):** unbound solid paints delta **0** on all seven
  (source and clone both 0, except the admin frame at 1 each: the inherited Admin Shell `Rectangle 223`, Decision Log #199).
* Auto-layout: the admin menu and its rows are auto-layout. The Contact Us frames and the two dropdown components are the
  existing absolute-layout legacy builds and were extended in place, as the brief says "do not rebuild frames".
* Not run: any code test (Figma and docs only).

## 6. Open, recorded not decided

* The closed Contact Us frames already have a chevron `OPEN_OVERLAY` reaction to the two dropdown components (read back
  live), so in a prototype run the seven-row list now opens from the existing frames with no re-wiring; the clones
  inherited the same reaction. The open and selected frames are static compositions and have no selection reaction
  (none existed before; wiring a click on an option to the selected frame is not part of this pass).
* The admin list and detail frames show the category as plain text; whether the inbox should render categories as chips
  is a design question, not part of this pass. The admin list sample rows do not show the new category (no sample row was
  edited); the filter-open frame is where it appears.
* "Reason for appeal" or account identifiers on the form are not drawn; the helper line is the only addition.
* The mobile message placeholder reads "Email Subject" (pre-existing typo noted in an earlier pass, left as is).
* `apps/web` `ContactPage` and `apps/admin` still carry six categories until the frontend PR that follows this pass.
