// Illustrative sample content for SportsHubPage.tsx's "Most Recent
// Stories" rail.
//
// This is the one remaining piece of dummy data on this page as of
// sprint-4/sports-hub-frontend-wiring -- every league, fixture and
// live score is now real (services/api/src/modules/sports/, Decision
// Log #6, Highlightly). "Most Recent Stories" has no backing endpoint:
// Section 4.6 defines fixtures/scores/standings/highlights, not a
// sports-news feed, and the real Blog module (services/api/src/modules/
// blog/) is a separate content pillar this ticket does not wire in here
// -- reusing it for this rail is a real, disclosed idea for a future
// pass, not silently done. Kept as sample content, same convention
// CommunityPage.tsx's "Trending News" rail already uses.
export const RECENT_STORIES = [
  { title: "Kane joins 250 club after heading Spurs past Wolves", meta: "2h ago" },
  { title: "NPFL roundup: Rivers United extend unbeaten run", meta: "5h ago" },
  { title: "Grassroots spotlight: Surulere United promoted", meta: "Yesterday" },
];
