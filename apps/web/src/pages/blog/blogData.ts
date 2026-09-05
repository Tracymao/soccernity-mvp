// Illustrative dummy data for BlogPage.tsx and ArticleDetailPage.tsx.
//
// Backend state, confirmed live before writing this: there is NO blog /
// article / content module anywhere in services/api/src/modules (unlike
// `sports` and `banter`, which at least have placeholder READMEs). The
// `Article` and `AdminUser` entities exist in prisma/schema.prisma (part
// of Build Plan Section 3's original 20) but have zero reads or writes --
// no controller, no service, no endpoint. Build Plan Section 4 defines no
// blog/news/article route, and the content pipeline (Admin Console ->
// `content-ops` drafts -> `Article`) is later-sprint work.
//
// So every article, category, comment and date below is hardcoded to
// match the Figma frames' own placeholder content ("Blog Page Desktop --
// Logged In" 5953:10771, "Blog -- Article Detail Desktop -- Logged In"
// 5997:10905), the same "dummy data ahead of the still-open backend
// blocker" convention SportsHubPage.tsx / CommunityPage.tsx already use.
// The two Figma exemplars -- the "Zaha double..." featured card and the
// "Kane joins 250 club..." secondary card -- are kept verbatim; the rest
// are illustrative in the same register so the category tabs and the
// per-category sections have something to render.

export interface BlogCategory {
  id: string;
  label: string;
}

// The filter-tab row from the Figma frame: All + five leagues. "More" is
// the catch-all bucket the frame uses for anything outside the four named
// leagues.
export const CATEGORIES: BlogCategory[] = [
  { id: "all", label: "All" },
  { id: "premier-league", label: "Premier League" },
  { id: "la-liga", label: "La Liga" },
  { id: "champions-league", label: "Champions League" },
  { id: "npfl", label: "NPFL" },
  { id: "more", label: "More" },
];

export interface Article {
  id: string;
  /** One of CATEGORIES' ids other than "all". */
  category: string;
  categoryLabel: string;
  title: string;
  excerpt: string;
  date: string;
  time: string;
  author: string;
  /** Full body, one entry per paragraph -- ArticleDetailPage renders these. */
  body: string[];
}

const LOREM_BODY: string[] = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu turpis molestie, dictum est a, mattis tellus. Sed dignissim, metus nec fringilla accumsan, risus sem sollicitudin lacus, ut interdum tellus elit sed risus. Maecenas eget condimentum velit, sit amet feugiat lectus.",
  "Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Praesent auctor purus luctus enim egestas, ac scelerisque ante pulvinar. Donec ut rhoncus ex. Suspendisse ac rhoncus nisl, eu tempor urna. Curabitur vel bibendum lorem.",
  "Morbi convallis convallis diam sit amet lacinia. Aliquam in elementum tellus. Curabitur tempor quis eros tempus lacinia. Nam bibendum pellentesque quam a convallis. Sed ut vulputate nisi. Integer in felis sed leo vestibulum venenatis.",
  "Suspendisse quis arcu sem. Aenean feugiat ex eu vestibulum vestibulum. Morbi a eleifend magna. Nam metus lacus, porttitor eu mauris a, blandit ultrices nibh. Mauris sit amet magna non ligula vestibulum eleifend. Nulla varius volutpat turpis sed lacinia.",
];

export const ARTICLES: Article[] = [
  {
    id: "zaha-double-crystal-palace",
    category: "premier-league",
    categoryLabel: "Premier League",
    title: "Zaha double helps Crystal Palace ease past Villa for first PL win",
    excerpt:
      "A double from Wilfried Zaha helped Crystal Palace to a 3-1 win against Aston Villa, picking up their first Premier League win of the new season.",
    date: "08/08/2022",
    time: "09:28 am",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "kane-250-club-spurs",
    category: "premier-league",
    categoryLabel: "Premier League",
    title: "Kane joins 250 club after heading Spurs past Wolves",
    excerpt:
      "Harry Kane scored his 250th goal for Tottenham as Antonio Conte's team survived a wobbly first half to beat Wolves 1-0.",
    date: "08/08/2022",
    time: "10:02 am",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "arsenal-newcastle-title-test",
    category: "premier-league",
    categoryLabel: "Premier League",
    title: "Arsenal's title push tested by a resurgent Newcastle",
    excerpt:
      "Two dropped points at St James' Park leaves the race at the top wide open going into a decisive run of fixtures.",
    date: "07/08/2022",
    time: "08:40 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "barcelona-clasico-preview",
    category: "la-liga",
    categoryLabel: "La Liga",
    title: "Barcelona rebuild faces its first real test in the Clasico",
    excerpt:
      "A young Barcelona side heads to the Bernabeu knowing a result would reshape the early-season narrative.",
    date: "06/08/2022",
    time: "01:15 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "girona-surprise-package",
    category: "la-liga",
    categoryLabel: "La Liga",
    title: "Girona are the surprise package no one wants to face",
    excerpt:
      "Sharp on the counter and organised at the back, Girona have quietly climbed into the European places.",
    date: "05/08/2022",
    time: "11:50 am",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "ucl-group-stage-draw",
    category: "champions-league",
    categoryLabel: "Champions League",
    title: "Champions League draw hands the holders a group of death",
    excerpt:
      "Three former winners in one group sets up a brutal midweek schedule from the very first matchday.",
    date: "04/08/2022",
    time: "06:00 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "ucl-nights-return",
    category: "champions-league",
    categoryLabel: "Champions League",
    title: "European nights return with a new format and old rivalries",
    excerpt:
      "The expanded league phase means more games, more permutations, and fewer dead rubbers in the spring.",
    date: "03/08/2022",
    time: "09:10 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "rivers-united-unbeaten-run",
    category: "npfl",
    categoryLabel: "NPFL",
    title: "NPFL roundup: Rivers United extend unbeaten run",
    excerpt:
      "A hard-fought away draw keeps Rivers United top of the table as the title race tightens at both ends.",
    date: "02/08/2022",
    time: "04:30 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "npfl-youth-breakthrough",
    category: "npfl",
    categoryLabel: "NPFL",
    title: "Three teenagers who are forcing their way into NPFL starting XIs",
    excerpt:
      "A new generation of academy graduates is getting real minutes, and the scouts have noticed.",
    date: "01/08/2022",
    time: "12:00 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "surulere-united-promoted",
    category: "more",
    categoryLabel: "Grassroots",
    title: "Grassroots spotlight: Surulere United promoted after cup final win",
    excerpt:
      "A Sunday-league side with no formal academy sealed promotion in front of a record crowd in Surulere.",
    date: "31/07/2022",
    time: "07:45 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "womens-game-grassroots-growth",
    category: "more",
    categoryLabel: "Grassroots",
    title: "The women's grassroots game is growing faster than the record books",
    excerpt:
      "Turnout at open trials has doubled in a year, but almost none of those players appear in any official database.",
    date: "30/07/2022",
    time: "10:20 am",
    author: "Admin",
    body: LOREM_BODY,
  },
  {
    id: "transfer-window-watch",
    category: "more",
    categoryLabel: "Transfers",
    title: "Transfer window watch: the deadline-day deals that actually matter",
    excerpt:
      "Beyond the headline fees, a handful of low-key signings look like the ones that will decide the season.",
    date: "29/07/2022",
    time: "11:59 pm",
    author: "Admin",
    body: LOREM_BODY,
  },
];

export function articlesByCategory(categoryId: string): Article[] {
  if (categoryId === "all") return ARTICLES;
  return ARTICLES.filter((a) => a.category === categoryId);
}

export function findArticle(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id);
}

export interface SampleComment {
  id: string;
  author: string;
  timeAgo: string;
  body: string;
  likes: number;
}

// The comment thread on the Figma Article Detail frame -- static
// placeholder content. There is no comments endpoint (no blog backend at
// all), so ArticleDetailPage renders these as a captioned sample and the
// compose box disabled.
export const SAMPLE_COMMENTS: SampleComment[] = [
  {
    id: "c1",
    author: "Alexis5",
    timeAgo: "35 minutes ago",
    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu turpis molestie, dictum est a, mattis tellus. Sed dignissim.",
    likes: 25,
  },
  {
    id: "c2",
    author: "Jadend",
    timeAgo: "42 minutes ago",
    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu turpis molestie, dictum est a, mattis tellus. Sed dignissim.",
    likes: 25,
  },
  {
    id: "c3",
    author: "Amadi3",
    timeAgo: "1 hour ago",
    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam.",
    likes: 25,
  },
];
