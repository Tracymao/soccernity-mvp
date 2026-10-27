// The Community-feed "Final week" carousel (build register B-092 front-end leg; Decision Log #388,
// #400 E10, #403 item 11, #404 items 6 and 15, #405 item 7, #406 item 6, #407; docs/contest-spec.md
// section 10b). Figma: component sets 6697:26234 (desktop) / 6697:27448 (mobile), in the feed
// frames 6661:26929 / 6661:29200; hover / focus 6836:29561 / 6838:29460; single page 6836:29600 /
// 6838:29502; last page 6836:29637; the entry a tile opens 6836:29397 / 6836:29312.
//
// What it is: the module sits at the top of the Community feed during the final week (from the
// reveal at 00:00 on day 25 to the month end, Europe/London). `GET /contest/final-week/carousel`
// answers `live: false` outside that window and for a restricted viewer, and the module simply is
// not rendered then. The ORDER is the server's balanced-impression rotation for this viewer; it is
// shown exactly as returned and never re-sorted, so nothing here can rank the finalists.
//
// What it never shows: any count (views, impressions, likes, comments, rank, follower numbers).
// None comes back from the server, and the frame draws none.
//
// Tiles open the entry itself: a tile is a link to /posts/:postId (the entry page). Opening a tile
// is NOT an impression; an impression is the in-view rule below.
//
// IMPRESSIONS (#405 item 7, #406 item 6): a tile that has been at least 50% in view for at least one
// CONTINUOUS second sends one event (useQualifiedImpression holds the rule). Only tiles on the page
// currently showing are rendered, so a tile on another page is never observed or counted. The send
// is fire-and-forget: a failure is invisible, a 409 (the window closed) hides the module, and the
// viewer never sees whether anything counted. The daily per-video cap is the server's.
//
// Wording: the transparency sentence is the one string here that tells people how the order works,
// so it carries the pending-legal-review tag exactly as the frame does (Decision Log #412 item 5);
// the rest is functional.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ContestApiError,
  getFinalWeekCarousel,
  recordImpression,
  type FinalWeekCarouselItem,
} from "../../api/contest";
import { isVideoUrl } from "../../lib/media";
import { useQualifiedImpression, type QualifiedImpression } from "../../lib/useQualifiedImpression";
import "./FinalWeekCarousel.css";

export const FINAL_WEEK_PAGE_SIZE = 3;

interface TileProps {
  item: FinalWeekCarouselItem;
  onImpression: (entryId: string, impression: QualifiedImpression) => void;
}

function Tile({ item, onImpression }: TileProps) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  useQualifiedImpression(ref, (impression) => onImpression(item.entryId, impression));
  const video = item.post.mediaUrls.find(isVideoUrl) ?? null;

  return (
    <li className="fwc__tile">
      <Link
        ref={ref}
        to={`/posts/${item.postId}`}
        className="fwc__tile-link"
        aria-label={`Open ${item.finalist.publicName}’s final entry`}
      >
        <span className="fwc__thumb" aria-hidden="true">
          {video ? <video className="fwc__video" src={`${video}#t=0.1`} preload="metadata" muted playsInline /> : null}
          <span className="fwc__play" />
        </span>
        <span className="fwc__name">{item.finalist.publicName}</span>
      </Link>
    </li>
  );
}

interface Props {
  accessToken: string;
}

export default function FinalWeekCarousel({ accessToken }: Props) {
  const [items, setItems] = useState<FinalWeekCarouselItem[]>([]);
  const [live, setLive] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getFinalWeekCarousel(accessToken)
      .then((response) => {
        if (cancelled) return;
        setLive(response.live && response.items.length > 0);
        setItems(response.items);
        setPage(0);
      })
      .catch(() => {
        // Non-critical: no module is better than a broken feed.
        if (!cancelled) setLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleImpression = useCallback(
    (entryId: string, impression: QualifiedImpression) => {
      recordImpression(accessToken, entryId, impression).catch((err: unknown) => {
        // The window closed: stop showing (and counting for) a module that is no longer live.
        if (err instanceof ContestApiError && err.status === 409) setLive(false);
        // Every other outcome (cap reached, restricted, blocked, network) is silent by design.
      });
    },
    [accessToken],
  );

  if (!live || items.length === 0) return null;

  const pageCount = Math.max(1, Math.ceil(items.length / FINAL_WEEK_PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const first = current * FINAL_WEEK_PAGE_SIZE;
  const shown = items.slice(first, first + FINAL_WEEK_PAGE_SIZE);
  const single = pageCount === 1;

  return (
    <section className="fwc" aria-labelledby="fwc-title" data-testid="final-week-carousel">
      <div className="fwc__head">
        <h2 id="fwc-title" className="fwc__title">
          Final week
        </h2>
        <div className="fwc__arrows">
          <button
            type="button"
            className="fwc__arrow"
            aria-label="Previous finalists"
            disabled={single || current === 0}
            onClick={() => setPage(current - 1)}
          >
            &#8249;
          </button>
          <button
            type="button"
            className="fwc__arrow"
            aria-label="Next finalists"
            disabled={single || current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            &#8250;
          </button>
        </div>
      </div>
      <p className="fwc__lead">Every finalist is shown to everyone equally.</p>
      <p className="fwc__note">
        Finalists appear in a different order for each viewer. The order is never based on likes, comments, ranking,
        follower count or when a video was uploaded. [COPY PENDING LEGAL REVIEW]
      </p>
      <ul className="fwc__tiles">
        {shown.map((item) => (
          <Tile key={item.entryId} item={item} onImpression={handleImpression} />
        ))}
      </ul>
      <div className="fwc__foot">
        <span className="fwc__count">
          Showing {first + 1}&ndash;{first + shown.length} of {items.length} finalist{items.length === 1 ? "" : "s"}
        </span>
        {!single && (
          <span className="fwc__dots">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className={i === current ? "fwc__dot fwc__dot--active" : "fwc__dot"}
                aria-label={`Page ${i + 1} of ${pageCount}`}
                aria-current={i === current ? "true" : undefined}
                onClick={() => setPage(i)}
              />
            ))}
          </span>
        )}
      </div>
    </section>
  );
}
