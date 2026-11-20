import { effectiveReadReceipts } from '../users/user-settings.constants';

// Read receipts (Decision Log #472; founder decision 2026-11-08). THE one place that decides whether the time a
// message was read may be shown to its sender.
//
// Message.readAt is still RECORDED whenever the recipient opens the chat (PATCH /conversations/:id/read): unread
// counts, the inbox badge and the collapsed 'message' Notification all use it. Only what is DISCLOSED changes.
//
// A message's read time is disclosed to its SENDER only when ALL of these hold (DEFAULT, founder-veto-able, in
// particular the age-class rule and the "evaluated at read time" consequence that turning receipts off later hides
// earlier seen states and turning them on shows them again):
//   1. the message has been read (readAt is not null),
//   2. the sender's EFFECTIVE read-receipts setting is on,
//   3. the reader's (the other participant's) EFFECTIVE setting is on,
//   4. sender and reader are in the same age class (both adult, or both under 18, by the stored isMinor flag).
// Otherwise readAt is returned as null. The READER never sees a read time for a message they received.
export interface ReceiptParty {
  isMinor: boolean;
  readReceipts: boolean | null;
}

export function canDiscloseReadAt(sender: ReceiptParty | undefined, reader: ReceiptParty | undefined): boolean {
  // A participant with no row (hard-deleted) is unknown: nothing is disclosed.
  if (!sender || !reader) return false;
  if (sender.isMinor !== reader.isMinor) return false;
  return (
    effectiveReadReceipts(sender.readReceipts, sender.isMinor) &&
    effectiveReadReceipts(reader.readReceipts, reader.isMinor)
  );
}
