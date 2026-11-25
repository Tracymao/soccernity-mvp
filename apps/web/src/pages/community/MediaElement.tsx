// One picture or video of a post, as the bare element (moved out of PostMedia.tsx so the sensitive-media
// wrapper can reuse it; unchanged behaviour for every existing caller).
import type { FeedPostMedia } from "../../api/feed";
import VideoPlayer from "../../components/VideoPlayer/VideoPlayer";

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
      <VideoPlayer
        src={src}
        videoClassName="post__media-video"
        preload={playVideo || onLoaded ? "metadata" : "none"}
        videoLabel="Video attached to this post"
        onLoadError={onLoadError}
        onLoadedData={onLoaded}
        onDuration={onDuration}
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
