import { IsBoolean } from 'class-validator';

// PATCH /admin/users/:id/child-safety-vetting — superadmin-only. Sets or
// unsets AdminUser.childSafetyVetted on the TARGET admin (:id), and
// vettedAt/vettedByAdminId together with it (see
// AdminStaffVettingService.setChildSafetyVetting's own comment for the
// exact write shape on true vs. false). A single required boolean, not a
// richer "vetting record" shape — this endpoint performs no verification
// itself; it only records a decision (a real-world DBS/background-check
// confirmation, or a correction) made outside the system.
export class SetChildSafetyVettingDto {
  @IsBoolean()
  childSafetyVetted!: boolean;
}
