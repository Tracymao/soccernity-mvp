// One picture or video of a post, as the bare element (moved out of PostMedia.tsx so the sensitive-media
// wrapper can reuse it; unchanged behaviour for every existing caller).
import type { SyntheticEvent } from "react";
import type { FeedPostMedia } from "../../api/feed";

interface Props {
  kind: FeedPostMedia["kind"];
  src: string;
  playVideo?: boolean;
  onLoadError?: () => void;
  /** Called when the picture has loaded, or the video's first frame is available (sensitive media only). */
  onLoaded?: () => void;
  /** Called with the video's length in seconds once it is known (sensitive media only). */
  onDuration?: (seconds: number) => void;
}

export default function MediaElement({ kind, src, playVideo, onLoadError, onLoaded, onDuration }: Props) {
  if (kind === "video") {
    return (
      <video
        className="post__media-video"
        src={src}
        controls
        preload={playVideo || onLoaded ? "metadata" : "none"}
        playsInline
        aria-label="Video attached to this post"
        onError={onLoadError}
        onLoadedData={onLoaded}
        onLoadedMetadata={(event: SyntheticEvent<HTMLVideoElement>) => {
          const seconds = event.currentTarget.duration;
          if (onDuration && Number.isFinite(seconds)) onDuration(seconds);
        }}
      />
    );
  }
  return (
    <img
      className="post__media-img"
      src={src}
      alt="Picture attached to this post"
      loading="lazy"
      onError={onLoadError}
      onLoad={onLoaded}
    />
  );
}
