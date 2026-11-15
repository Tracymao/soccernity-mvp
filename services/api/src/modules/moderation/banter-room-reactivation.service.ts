import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { BanterService } from '../banter/banter.service';
import { isAdminChildSafetyVetted } from './child-safety-vetting.util';
import { ReactivateBanterRoomDto } from './dto/reactivate-banter-room.dto';
import { ROOM_DEACTIVATED_ACTION } from './moderation.constants';
import { ModerationService } from './moderation.service';

// backend/room-staff-reactivation (Decision Log #515, founder decision 2026-11-15). Until now `room_deactivated`
// (recorded on a report, Decision Log #357) was one-way for staff: only the room's CREATOR could set a room back to
// active, so a room staff deactivated by mistake stayed inactive forever once its creator was anonymised
// (docs/backend-room-with-purged-creator-report.md, finding 3). This lets staff undo THEIR OWN deactivation.
//
// What counts as "staff deactivated this room": the most recent of two audit-log events for the room decides.
//   - a `report.actioned` row with notes `room_deactivated` whose target is a report ABOUT this room (a Report row
//     with targetType 'banter_room' and targetId = the room), or
//   - a `banter_room.reactivated` row for the room (written by this service).
// If the latest event is a deactivation, staff may reactivate it. If the latest is a reactivation, or there is no
// deactivation event at all (the room was never deactivated by staff), they may not.
//
// LIMITS (DEFAULT, founder-veto-able, disclosed): (1) the creator's own manual toggles are not audited anywhere, so
// when staff deactivate, the creator reactivates and then deactivates the room again, this service still sees "staff
// deactivated" as the latest event and would let staff reactivate a room the creator has since switched off.
// (2) The audit row can only be tied to the room through the Report row, and a Report is deleted by the retention
// sweep (6 or 7 years after it closes), so once that report is gone staff can no longer reactivate the room.
//
// Nobody is notified: no Notification, no guardian notice (the guardian-security-notice registry has a
// `room_deactivated` safety event but no reactivation event, and the creator may be an anonymised account). The
// audit row is the only record.
export const ROOM_ALREADY_ACTIVE_CODE = 'banter_room_already_active';
export const ROOM_NOT_STAFF_DEACTIVATED_CODE = 'banter_room_not_staff_deactivated';

interface StaffDeactivation {
  reportId: string;
  concernsMinor: boolean;
}

export interface ReportedRoomView {
  id: string;
  status: string;
  // true when the room is inactive, staff deactivated it (and nobody has reactivated it since) and THIS admin may
  // reactivate it (a deactivation on a child-safety-flagged report needs a vetted admin).
  staffMayReactivate: boolean;
}

@Injectable()
export class BanterRoomReactivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly banterService: BanterService,
    private readonly moderationService: ModerationService,
  ) {}

  // The latest staff deactivation that has not been undone by staff, or null. Reads on `db` so it can run inside
  // the reactivation transaction.
  private async findStaffDeactivation(
    db: Prisma.TransactionClient | PrismaService,
    roomId: string,
  ): Promise<StaffDeactivation | null> {
    const reports = await db.report.findMany({
      where: { targetType: 'banter_room', targetId: roomId },
      select: { id: true, concernsMinor: true },
    });
    const events: Prisma.AdminActionLogWhereInput[] = [
      {
        action: ADMIN_ACTION_LOG_ACTIONS.BANTER_ROOM_REACTIVATED,
        targetType: ADMIN_ACTION_LOG_TARGET_TYPES.BANTER_ROOM,
        targetId: roomId,
      },
    ];
    if (reports.length > 0) {
      events.unshift({
        action: ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
        targetType: ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
        targetId: { in: reports.map((r) => r.id) },
        notes: ROOM_DEACTIVATED_ACTION,
      });
    }
    const latest = await db.adminActionLog.findFirst({
      where: { OR: events },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { action: true, targetId: true },
    });
    if (!latest || latest.action === ADMIN_ACTION_LOG_ACTIONS.BANTER_ROOM_REACTIVATED) {
      return null;
    }
    const report = reports.find((r) => r.id === latest.targetId);
    return report ? { reportId: report.id, concernsMinor: report.concernsMinor } : null;
  }

  // Read-only state for a Banter Room report's detail (GET /admin/moderation/reports/:id). null when the room row
  // is gone. `staffMayReactivate` is computed for the CALLING admin, so an admin who is not child-safety vetted is
  // not offered a reactivation the server would refuse.
  async describeRoom(roomId: string, adminId: string): Promise<ReportedRoomView | null> {
    const room = await this.prisma.banterRoom.findUnique({ where: { id: roomId }, select: { id: true, status: true } });
    if (!room) return null;
    let staffMayReactivate = false;
    if (room.status === 'inactive') {
      const deactivation = await this.findStaffDeactivation(this.prisma, roomId);
      if (deactivation) {
        staffMayReactivate = !deactivation.concernsMinor || (await isAdminChildSafetyVetted(this.prisma, adminId));
      }
    }
    return { id: room.id, status: room.status, staffMayReactivate };
  }

  // Order: 404 (room), 409 already active, 409 not deactivated by staff, 403 vetting, then the write. DEFAULT: the
  // vetting gate comes after the two 409s because it depends on the report that deactivated the room, which is
  // only known once the 409s have passed.
  async reactivate(roomId: string, adminId: string, dto: ReactivateBanterRoomDto): Promise<{ id: string; status: 'active' }> {
    const room = await this.prisma.banterRoom.findUnique({ where: { id: roomId }, select: { id: true, status: true } });
    if (!room) {
      throw new NotFoundException('Banter Room not found');
    }
    if (room.status === 'active') {
      throw this.alreadyActive();
    }
    const deactivation = await this.findStaffDeactivation(this.prisma, roomId);
    if (!deactivation) {
      throw this.notStaffDeactivated();
    }
    // The report that deactivated the room decides the gate (B-297 / #491 shape: a child-safety-flagged report needs
    // a vetted admin, any role). Another report on the same room does not.
    await this.moderationService.assertVettedToActOn(
      { concernsMinor: deactivation.concernsMinor, targetType: 'banter_room', targetId: roomId },
      adminId,
    );

    const note = dto.note?.trim() ? dto.note.trim() : null;

    await this.prisma.$transaction(async (tx) => {
      // Two staff members pressing at once: one lock per room, then everything is re-read under it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`banter-room-reactivate:${roomId}`}))`;
      const current = await tx.banterRoom.findUnique({ where: { id: roomId }, select: { status: true } });
      if (!current) {
        throw new NotFoundException('Banter Room not found');
      }
      if (current.status === 'active') {
        throw this.alreadyActive();
      }
      const again = await this.findStaffDeactivation(tx, roomId);
      if (!again) {
        throw this.notStaffDeactivated();
      }
      // The one status-write path room_deactivated already uses.
      await this.banterService.setRoomStatus(tx, roomId, 'active');
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.BANTER_ROOM_REACTIVATED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.BANTER_ROOM,
          targetId: roomId,
          notes: note ? `report=${again.reportId}; note=${note}` : `report=${again.reportId}`,
        },
      });
    });

    return { id: roomId, status: 'active' };
  }

  private alreadyActive(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: ROOM_ALREADY_ACTIVE_CODE,
      message: 'This Banter Room is already active.',
    });
  }

  private notStaffDeactivated(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: ROOM_NOT_STAFF_DEACTIVATED_CODE,
      message: 'Staff can only reactivate a Banter Room that staff deactivated.',
    });
  }
}
