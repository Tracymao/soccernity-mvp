import { SetMetadata } from '@nestjs/common';

// sprint-5/admin-moderation-queue-backend — the first role-gating
// decorator anywhere in this codebase. Until this PR, every admin route
// checked only AdminJwtAuthGuard (a valid admin-console token exists at
// all); nothing distinguished editor | moderator | superadmin. Build Plan
// Section 4.8's moderation queue is the first admin surface that needs
// that distinction — AdminUser's own schema comment already describes
// two different jobs ("authors Articles; actions Reports"), and an
// editor should not have queue access.
//
// USAGE — apply alongside AdminJwtAuthGuard (AdminRolesGuard reads
// request.admin.role, which only exists once AdminJwtAuthGuard has run):
//
//   @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
//   @AdminRoles('moderator', 'superadmin')
//   @Get('some-role-gated-admin-route')
//   handler() { ... }
//
// A route with no @AdminRoles(...) at all is treated as "any
// authenticated admin may access it" (AdminRolesGuard's own default),
// matching every admin route built before this PR — adding this guard to
// AdminAuthFoundationModule's exports does not retroactively lock down
// anything that didn't already opt in.
export const ADMIN_ROLES_KEY = 'adminRoles';
export const AdminRoles = (...roles: string[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
