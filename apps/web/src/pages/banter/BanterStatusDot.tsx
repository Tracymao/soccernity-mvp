import type { BanterRoomStatus } from "../../api/banter";

// Decision Log #357 — the Bants room status dot (Figma Status Dot —
// active / — inactive, 2353:1610 desktop, 5650:8205 / 5650:8214 mobile).
// Active is brand green; inactive is the navy-15% icon-inactive token,
// the same muted treatment the Figma inactive dot resolves to.
export default function BanterStatusDot({ status }: { status: BanterRoomStatus }) {
  return (
    <span
      className={`banter-status-dot banter-status-dot--${status}`}
      role="img"
      aria-label={status === "active" ? "Active room" : "Inactive room"}
    />
  );
}
