// A thin, indeterminate progress bar with no visible text (Decision Log CH-H13: passing checks are
// silent). Shown while a picture or video is being checked in the background; it disappears when the
// check passes and the file simply appears. Screen readers get the aria-label only.
import "./MediaUpload.css";

interface Props {
  /** For example "Checking picture". Not shown on screen. */
  label: string;
  className?: string;
}

export default function QuietProgress({ label, className }: Props) {
  return (
    <div className={`quiet-progress${className ? ` ${className}` : ""}`} role="progressbar" aria-label={label}>
      <span className="quiet-progress__fill" />
    </div>
  );
}
