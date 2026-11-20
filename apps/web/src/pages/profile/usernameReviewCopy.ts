// Wording for the username-review card on Create Profile (B-139 part (c), Decision Log #467).
// Figma: Create Profile — Username Review frames 6956:44591 to 6956:46409 (desktop; mobile twins
// 6956:44130 to 6956:44382). Every sentence that talks about the review carries the literal tag, as the
// frames do; short labels (buttons, pills, card titles) are tagged in the frames' layer names and are
// not tagged here. Listed in docs/pending-copy-manifest.md.
//
// WHERE THE FRAMES SHOW DATA THE SERVER DOES NOT SEND, the clause is left out, not invented:
// the removed handle ("@adab") and the request date ("on 2 Nov 2026"). GET /users/me/username-review
// returns only { state, requestableUntil }. Founder decision 2026-11-04: build with the data omitted.

export const ENTRY_TITLE = "Your username was removed";
export const ENTRY_LINE_1 = "Your username was removed by Soccernity. [COPY PENDING LEGAL REVIEW]";
export const ENTRY_LINE_2 =
  "You can choose a new username below, or ask for a review of the removal. You can ask once, within 30 days of the removal. [COPY PENDING LEGAL REVIEW]";
export const ASK_BUTTON = "Ask for a review";

export const FORM_TITLE = "Ask for a review";
export const MESSAGE_LABEL = "Message (optional)";
export const FORM_NOTE =
  "A different member of our team reviews your request. Their decision is final. [COPY PENDING LEGAL REVIEW]";
export const SEND_BUTTON = "Send request";
export const SENDING_BUTTON = "Sending…";
export const CANCEL_BUTTON = "Cancel";

export const REQUEST_TITLE = "Your review request";
export const SENT_TITLE = "Request sent";
export const SENT_LINE =
  "We’ll show the result here and send you a notification when it’s decided. [COPY PENDING LEGAL REVIEW]";

export const PENDING_PILL = "Pending";
export const PENDING_LINE_1 = "You asked for a review. Our team is looking at it. [COPY PENDING LEGAL REVIEW]";
export const PENDING_LINE_2 =
  "The result will appear here, and you will get a notification. [COPY PENDING LEGAL REVIEW]";

export const DECLINED_TITLE = "Review decided";
export const DECLINED_PILL = "Declined";
export const DECLINED_LINE_1 =
  "Our team decided to keep the username removed. The decision is final and cannot be reviewed again. [COPY PENDING LEGAL REVIEW]";
export const CHOOSE_NEW_LINE = "Choose a new username below to continue. [COPY PENDING LEGAL REVIEW]";

// Shown when the server says the time to ask has passed (403 username_review_window_closed). The frame
// (6956:46194) also names the handle and the removal date; both are left out (not in the response).
export const WINDOW_PASSED_LINE = "The time to ask for a review has passed. [COPY PENDING LEGAL REVIEW]";

// Frame 09 (6956:46399) and frame 10 (6956:46608).
export const ERROR_COULD_NOT_SEND =
  "Couldn’t send your request. Check your connection and try again. [COPY PENDING LEGAL REVIEW]";
export const ERROR_ALREADY_ASKED =
  "You’ve already asked for a review of this removal. The result will appear here. [COPY PENDING LEGAL REVIEW]";

// No frame draws these two; plain functional wording, no legal or safety promise (#412 item 5).
export const ERROR_TOO_MANY = "Too many attempts. Wait a minute and try again.";
export const ERROR_NOT_AVAILABLE = "There is no username removal to ask a review of.";
