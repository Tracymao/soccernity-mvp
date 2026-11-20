// The one shared gate for any vendor-dependent Match Centre field. Its availability
// comes from the backend signal (api/sports.ts's FieldAvailability, derived server-side
// from the capability registry in
// services/api/src/modules/sports/sports-data-provider.constants.ts).
//
// Decision Log #378 / #462 item (h): a field the data vendor does not supply is HIDDEN,
// not shown as a disabled placeholder. 'not_available_from_provider' therefore renders
// nothing at all: no section, no title, no notice, no gap. Children render only when the
// signal is 'available'.
//
// 'no_data' is a different statement and is kept: the vendor CAN supply the field but
// nothing is cached for this match yet, so the section stays visible with its message.
import type { ReactNode } from "react";
import type { FieldAvailability } from "../../api/sports";

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
  if (availability === "not_available_from_provider") return null;

  return (
    <section className="mc-section mc-disabled" aria-disabled="true" data-availability={availability}>
      <h2 className="mc-section__title">{label}</h2>
      <p className="mc-disabled__message">No data for this match yet</p>
    </section>
  );
}
