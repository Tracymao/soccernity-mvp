# Figma: message-target Report Detail variants to the premium standard (pass 2)

Date: 2026-11-27. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only, no app code. Shipped admin code is the source of truth
(`ReportedMessageFields`, `ContextMessagesCard`, `ReportDetailPage`, `holdActions`). Blocks are clones of the pass 1 frames (7041:60951, 7036:61037) and the
Moderation Queue callout; frame ids and names are unchanged. No source frame was edited.

All seven frames: title "Report #1051" at 301,129; one visible search bar at 302,182 (740x44); Content at 301,258, 1098 wide, 20 between blocks;
frame and Admin Shell height = last block bottom + 45.

## Frames

Card heights run top to bottom, starting with the "← Moderation Queue" header (16).

| Frame | What Reported content shows | Context card | Buttons (excluding Record escalation) | Card heights | Frame height |
|---|---|---|---|---|---|
| 7011:57551 edited | Type, Target id, Sender, Sent, Edited, current text, original text | none | Remove Content, Warn User, Suspend User, Dismiss Report, Reporter acted in bad faith, Legal hold | 16/487/441/253/323 | 1903 |
| 7041:61295 default | Type, Target id, Sender, Sent, Message text | none | same six | 16/355/441/253/323 | 1771 |
| 7011:57728 deleted | as default, plus Message status "Deleted by the sender" | none | same six | 16/409/441/253/323 | 1825 |
| 7027:59180 messages included | as default | note + 11 rows, reported row outlined | same six | 16/355/669/441/253/323 | 2460 |
| 7027:59472 none included | as default | "did not add any messages" note | same six | 16/355/93/441/253/323 | 1884 |
| 7045:62777 context hidden | as default, plus Edited and "Message text (current)"; no original | callout "Context hidden: this involves a child." | Remove Content, Warn User, Suspend User, Dismiss Report, then the vetted-admin holds line; no hold callout | 16/409/117/441/229/323 | 1938 |
| 7036:61393 after Remove Content | Type, Target id, Content "Content removed", Sender, Sent, Message text | none | Record an appeal, Reporter acted in bad faith, Legal hold (no Take action card) | 16/411/495/113/169/323 | 1930 |

Every frame ends with the unchanged Escalate card. 7036:61393 has Report details (Status "Actioned"), Already reviewed and Case-level actions cloned from 7036:61037.

## Archived

- In each of the seven frames: the old Content and the old search bar are renamed "ARCHIVED - ..." and hidden. Nothing deleted.
- 7045:62777 only: in the new Take action clone, the two hold buttons and the hold callout are hidden (the code does not draw them).
- 7011:57380 is renamed "ARCHIVED — Admin — Report Detail — Message target (W8) (superseded by 7041:61295)" and hidden. It was not moved.
  **This is a judgement call the founder can reverse** (rename back and show it).

## Standing checks

- Top-level count 2004; id hash 2327422288 (baseline, unchanged).
- Moderation Queue content 5794:8710: 300,45 1100x620. Canonical 5796:8635 Content: 301,258 1098x1282.
- Per frame: cards at x=301, 1098 wide; gaps 20; every button 40 high; no overlaps; no unbound solid fills outside the Admin Shell; no text under 12px;
  no uppercase labels; one search bar; frame and shell heights equal.
- Screenshots reviewed: 7011:57551, 7027:59180 (before the pill-height fix), 7045:62777. After the fix, the 18 context pills measure 24 high.

## Not matched, or filled by assumption

1. **Target id:** the old frames had none, so all seven keep the canonical sample UUID.
2. **Sender:** the old frames showed "@matthew_amuloko (Matthew Amuloko)". The server returns the public name only, so "@matthew_amuloko" is drawn.
3. **Dates:** "Edited" is "Yes, at 2 Nov 2026, 08:09". The old deletion time (08:20) is dropped because the server returns none.
4. **Message text** is drawn without the old curly quotes; the code renders the stored text as is.
5. **Context row edit time:** the old row had none and the code requires one. "2 Nov 2026, 08:08" is made up for the sample.
6. **Context rows:** the 11 old sample messages are kept in order. The "messages not included" gap rows are gone (the code draws none).
7. **Severity and Concerns a minor:** the old frames had neither, so "Medium" and "No" are kept. That includes the context-hidden frame, where the chat
   involves a child; with "Yes" the code would also show a concerns-a-minor line in Take action.
8. **After Remove Content:** Report details (with "Action taken") and the "Already reviewed" date (12 Aug 2026, 14:05) are the 7036:61037 sample values.
   That date is earlier than this frame's sent date (2 Nov 2026).
9. **Status in older annotations** ("Label - ..." frames) was not touched and may describe the old layout.
10. **Bindings:** the context rows' sender names are Inter Medium 14 with no text style (there is no 14 Medium style). The new layout frames (rows, list,
    message box) use literal spacing and radius values; their fills and strokes are bound paints.

## Not in this pass

Appeal Review, hold and suspend dialogs, the "Record an appeal" frames, 7042:61926.
