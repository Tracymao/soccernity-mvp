// The one shared "never fake it" placeholder for any vendor-dependent Match Centre
// field. Its availability comes from the backend signal (api/sports.ts's
// FieldAvailability, derived server-side in
// services/api/src/modules/sports/sports-data-provider.constants.ts). Children render
// ONLY when the signal is 'available' — nothing is ever shown as a value for data
// that isn't there.
//
// The two unavailable states are deliberately different strings. "Not available from
// current data provider" is a statement about the vendor, not about this match; "No
// data for this match yet" is the opposite. Collapsing them would tell a user that a
// vendor-level gap is just a temporary missing row.
import type { ReactNode } from "react";
import type { FieldAvailability } from "../../api/sports";

const UNAVAILABLE_MESSAGE: Record<Exclude<FieldAvailability, "available">, string> = {
  not_available_from_provider: "Not available from current data provider",
  no_data: "No data for this match yet",
};

export default function FieldAvailabilityGate({
  label,
  availability,
  children,
}: {
  label: string;
  availability: FieldAvailability;
  children?: ReactNode;
}) {
  if (availability === "available") return <>{children}</>;

  return (
    <section className="mc-section mc-disabled" aria-disabled="true" data-availability={availability}>
      <h2 className="mc-section__title">{label}</h2>
      <p className="mc-disabled__message">{UNAVAILABLE_MESSAGE[availability]}</p>
    </section>
  );
}
