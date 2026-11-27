# Figma: admin Report Detail variants (pass 1) at the premium standard

Nine Report Detail variant frames on page 0:1 were rebuilt from the blocks of the canonical frame 5796:8635 (read-only), following the shipped `ReportDetailPage`. Figma and docs only. Frame ids, names and positions are unchanged.

Hold buttons = "Reporter acted in bad faith" and "Legal hold". All buttons are 40 high; cards are at x 301, 1098 wide, 20 apart.

| Frame | Target | Buttons before the hold buttons | Helper line | Card heights, top to bottom | Frame height |
|---|---|---|---|---|---|
| 7041:60951 | Post | Remove Content, Warn User, Suspend User, Dismiss Report | post's author | 169, 441, 253, 323 | 1585 |
| 7041:61123 | Comment | Remove Content, Warn User, Suspend User, Dismiss Report | comment's author | 169, 441, 253, 323 | 1585 |
| 7041:61467 | User | Warn User, Suspend User, Dismiss Report | reported account | 169, 441, 233, 323 | 1565 |
| 7041:61631 | Bants room | Warn User, Dismiss Report, Deactivate Room | not offered, Banter Room report | 169, 116 (Bants room), 441, 233, 323 | 1701 |
| 7041:61798 | Grassroots team | Warn User, Dismiss Report | not offered, team report | 169, 441, 233, 323 | 1565 |
| 7041:61965 | Grassroots fixture | Warn User, Dismiss Report | not offered, fixture report | 169, 441, 233, 323 | 1565 |
| 7041:62132 | Contact enquiry | Warn User, Dismiss Report | not offered, this kind of report | 169, 387, 233, 323 | 1511 |
| 7036:61037 | Post, after Remove Content | none (case-level only) | none | 225, 495, 113 (Already reviewed), 169 (Case-level actions), 323 | 1744 |
| 7036:61215 | Comment, after Remove Content | none (case-level only) | none | 225, 495, 113, 169, 323 | 1744 |

## Archived

- In each of the nine frames the old `Content` (with its old page title) and, where the frame had one, the old search bar are renamed `ARCHIVED - ...` and hidden.
- 7041:62132 had no search bar of its own; the one inside its Admin Shell instance is hidden so the frame shows exactly one.
- Four superseded top-level frames are renamed `ARCHIVED — ... (superseded by ...)` and hidden, as 7036:60527 was: 7036:59847, 7036:60017, 7036:60187, 7036:60357. Nothing was deleted, moved or reordered.

## Checks

- Page 0:1: 2004 top-level nodes; id hash 2327422288 (matches the baseline).
- Moderation Queue content 5794:8710: 300,45 1100x620. Canonical Content 5796:8710: 301,258 1098x1282.
- All nine frames: no overlapping cards or buttons, no unbound solid fills outside the Admin Shell and search bar, no text under 12px, no uppercase labels, one visible search bar, frame and shell heights equal. No grown frame overlaps another top-level node.
- Screenshots reviewed: 7041:60951, 7041:61631, 7036:61037.

## Not matched, or filled by assumption

1. **Target id:** the old frames had none, so all nine keep the canonical sample UUID.
2. **Severity and Concerns a minor:** only the enquiry frame had them. The other eight keep the canonical "Medium" and "No".
3. **Old preview fields** (author, posted date, text excerpt, room name, team, city, fixture, enquiry contact details and message) are not on the shipped cards and were not carried over.
4. **Report number and time:** titles keep "Report #1052" style and Submitted keeps "2 hours ago". The app shows the first 8 characters of the id and a formatted date.
5. **Bants room status:** the old frame showed none. It is drawn "Active", with no Reactivate Room button.
6. **After Remove Content:** the old frames had no action date, so the note uses 12 Aug 2026, 14:05. That is earlier than the old sample's post date (2 Nov 2026). No pending appeal, so no review link. The code can also offer "Record an appeal" here; it is not drawn.
7. **Enquiry frame 7041:62132:** drawn as a plain Report Detail. "Escalated by" became Reporter, "Reason" became Reason category, and there is no Description. The shipped code renders contact-enquiry reports with `EnquiryReportView` (already drawn at 6878:31683), so this frame may be redundant. It was not archived.
8. **Message target:** 7036:60187 is archived as superseded by 7041:61295, which this pass did not restyle. 7036:61393 is also untouched.
