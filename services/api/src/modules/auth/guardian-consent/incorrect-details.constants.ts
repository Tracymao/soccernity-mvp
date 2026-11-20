// B-029 (Decision Log #372). The one message a guardian sees when they try to
// approve (or start a card payment) while an incorrect-details report is open.
// Its own file so the consent service and the card-verification service can
// both import it without importing each other. Specs assert this same string.
export const INCORRECT_DETAILS_OPEN_MESSAGE =
  'You reported incorrect details for this account, so it cannot be approved until support has reviewed them. You can still decline.';
