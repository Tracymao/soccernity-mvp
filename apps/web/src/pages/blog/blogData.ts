// Sample comment thread for ArticleDetailPage.tsx. BlogPage.tsx and
// ArticleDetailPage.tsx are wired to the real, public Blog/Articles feed
// (sprint-4/public-blog-articles-feed, services/api/src/modules/blog/,
// via ../../api/blog.ts) -- the dummy Article/Category data that used to
// live here is gone. This file now holds ONLY the comment thread, since
// there is still no comments endpoint anywhere in Build Plan Section 4
// (explicitly out of scope -- see ArticleDetailPage.tsx's own header
// comment) -- the compose box stays disabled and the thread below is
// rendered as a visibly captioned sample, never faked as real.

export interface SampleComment {
  id: string;
  author: string;
  timeAgo: string;
  body: string;
  likes: number;
}

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
