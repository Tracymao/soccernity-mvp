// Page loader (Decision Log #581): code-only.
// Placeholder shapes for lists and card grids while their data loads.

import "./loading.css";

interface SkeletonProps {
  variant?: "line" | "block" | "circle";
  width?: number | string;
  height?: number | string;
  className?: string;
}

export default function Skeleton({ variant = "line", width, height, className }: SkeletonProps) {
  const classes = ["sn-skeleton", `sn-skeleton--${variant}`, className].filter(Boolean).join(" ");
  return <span aria-hidden="true" className={classes} style={{ width, height }} />;
}

interface SkeletonListProps {
  /** Screen-reader wording for the wait. */
  label: string;
  /** "rows" for a table or list, "cards" for a stack of posts. */
  shape?: "rows" | "cards";
  count?: number;
}

export function SkeletonList({ label, shape = "rows", count = shape === "rows" ? 6 : 3 }: SkeletonListProps) {
  return (
    <div role="status" className={`sn-skeleton-list sn-skeleton-list--${shape}`}>
      <span className="sn-visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) =>
        shape === "rows" ? (
          <div className="sn-skeleton-row" key={index} aria-hidden="true">
            <Skeleton variant="circle" width={32} height={32} />
            <Skeleton width="45%" />
            <Skeleton width="15%" />
          </div>
        ) : (
          <div className="sn-skeleton-card" key={index} aria-hidden="true">
            <div className="sn-skeleton-card__head">
              <Skeleton variant="circle" width={40} height={40} />
              <Skeleton width="35%" />
            </div>
            <Skeleton width="90%" />
            <Skeleton width="70%" />
            <Skeleton variant="block" height={120} />
          </div>
        ),
      )}
    </div>
  );
}
