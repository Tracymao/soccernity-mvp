// Article cover image slot -- shared by BlogPage.tsx (featured + grid
// cards), ArticleDetailPage.tsx (hero + "More Trending News" cards).
//
// Built plain, no Figma frame: the Blog frames only ever show the image
// as a flat placeholder box, so this keeps that exact box (same className,
// same aspect ratio, same tinted background) and layers a real <img> on
// top only when a cover is set. When there is no cover, or the image
// fails to load, the box simply stays as the tinted placeholder -- no
// broken-image icon, no layout shift.
//
// Decorative only: the article title sits directly beside every use of
// this slot, so the image carries alt="" and the wrapper is aria-hidden,
// rather than repeating the title to screen readers.
//
// `failedUrl` (not a boolean) so a reused instance -- the detail page
// navigating between articles via a related card -- re-attempts a new
// URL instead of inheriting an earlier article's failure.
import { useState } from "react";
import type { ArticleCoverImage } from "../../api/blog";
import "./CoverMedia.css";

interface CoverMediaProps {
  coverImage: ArticleCoverImage | null;
  /** The placeholder box's own class (sizing, radius, tint) from the page's CSS. */
  className: string;
}

export default function CoverMedia({ coverImage, className }: CoverMediaProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Only `image` covers are rendered. Admin pickers are image-only today;
  // anything else falls back to the placeholder rather than guessing at a
  // <video> element nothing has asked for yet.
  const showImage = coverImage !== null && coverImage.type === "image" && failedUrl !== coverImage.url;

  return (
    <span className={`${className} cover-media`} aria-hidden="true">
      {showImage && (
        <img
          className="cover-media__img"
          src={coverImage.url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(coverImage.url)}
        />
      )}
    </span>
  );
}
