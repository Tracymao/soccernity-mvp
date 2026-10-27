// The client half of server-validated view qualification (build register B-093; Decision Log #384;
// docs/contest-spec.md sections 9c and 13; services/api/src/modules/view-qualification/README.md).
//
// While a post is on screen the client reports, about every 3 seconds, that it is ACTIVE and (for a
// video) where the playhead is. It NEVER reports how long it has watched: the server keeps the clock,
// credits only the gap between two beats it received itself, and decides what counts (a view earns
// points only at its threshold: 3 s for a photo or text, the video's length up to 60 s for a video).
// The response is only `{ done }`: it never says whether anything was awarded, and this hook never
// shows anything either.
//
// ACTIVE means all of: the post is at least half in view, the tab is in the foreground and, when the
// post has a video, a video is actually playing (not paused or ended). A video that is merely linked
// (the feed shows a link, not a player) is never reported: nothing is watching it, so there is no
// honest beat to send.
//
// One viewing session per stay on screen: it starts when the post comes into view, ends when it leaves
// (or the tab hides, or the server says `done`), and a return starts a new one with a new id. Every
// failure is swallowed and stops that session: a view that cannot be reported is a view that is not
// counted, never an error shown to the person.
//
// Not sent for the viewer's own post (the engine exempts self-engagement, so a beat is wasted) or for a
// locked final entry. No IntersectionObserver (an old browser, jsdom): nothing is sent.
import { useEffect, useRef, type RefObject } from "react";
import { newEventId } from "./useQualifiedImpression";

export const HEARTBEAT_INTERVAL_MS = 3000;
export const HEARTBEAT_MIN_RATIO = 0.5;

export interface HeartbeatBeat {
  sessionId: string;
  active: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
}

export interface HeartbeatOptions {
  enabled: boolean;
  /** The post carries a video URL: beats need a playing <video> inside the element. */
  hasVideo: boolean;
  send: (beat: HeartbeatBeat) => Promise<{ done: boolean }>;
}

export function useViewHeartbeat(ref: RefObject<Element | null>, options: HeartbeatOptions): void {
  const latest = useRef(options);
  latest.current = options;
  const { enabled } = options;

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;

    let ratio = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let sessionId: string | null = null;
    let finished = false; // the server said done, or a send failed: no more beats this stay

    const endSession = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      sessionId = null;
    };

    const beat = () => {
      if (!sessionId || finished) return;
      const { hasVideo, send } = latest.current;
      const video = hasVideo ? element.querySelector("video") : null;
      // A linked video nobody is playing cannot be watched: report nothing rather than a false "active".
      if (hasVideo && !video) return;
      const playing = video ? !video.paused && !video.ended : true;
      const body: HeartbeatBeat = {
        sessionId,
        active: ratio >= HEARTBEAT_MIN_RATIO && !document.hidden && playing,
      };
      if (video) {
        body.positionSeconds = Math.max(0, video.currentTime || 0);
        if (Number.isFinite(video.duration) && video.duration >= 0.5) body.durationSeconds = video.duration;
      }
      send(body)
        .then((response) => {
          if (response.done) {
            finished = true;
            endSession();
          }
        })
        .catch(() => {
          finished = true;
          endSession();
        });
    };

    const evaluate = () => {
      const onScreen = ratio >= HEARTBEAT_MIN_RATIO && !document.hidden;
      if (!onScreen) {
        // Leaving view (or the tab hiding) ends the stay; coming back is a new session.
        endSession();
        finished = false;
        return;
      }
      if (timer === null && !finished) {
        sessionId = newEventId();
        beat();
        timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        evaluate();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", evaluate);

    return () => {
      endSession();
      observer.disconnect();
      document.removeEventListener("visibilitychange", evaluate);
    };
  }, [ref, enabled]);
}
