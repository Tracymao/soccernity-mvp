// B-056 (Decision Log #472): the Dashboard's "Latest posts" table. Figma 6990:56075 draws five rows.
// DEFAULT, founder-veto-able: five rows, no paging.
export const DASHBOARD_LATEST_POSTS_DEFAULT = 5;
export const DASHBOARD_LATEST_POSTS_MAX = 5;

// DEFAULT, founder-veto-able: the two-line "Post" cell is the first 140 characters of the post text (counted
// in Unicode code points, so an emoji is never cut in half), trimmed, no ellipsis added.
export const DASHBOARD_LATEST_POSTS_EXCERPT_LENGTH = 140;
