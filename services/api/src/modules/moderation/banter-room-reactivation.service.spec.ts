import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ADMIN_ACTION_LOG_ACTIONS } from '../admin-action-log/admin-action-log.constants';
import {
  BanterRoomReactivationService,
  ROOM_ALREADY_ACTIVE_CODE,
  ROOM_NOT_STAFF_DEACTIVATED_CODE,
} from './banter-room-reactivation.service';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from './moderation.constants';

// backend/room-staff-reactivation (Decision Log #515). A hand-built Prisma mock: reports about the room, the
// admin-action-log events, the room row and the vetting flag. The REAL ModerationService.assertVettedToActOn is not
// needed here (the room is not a message), so the stand-in applies the same concernsMinor rule.
function build(opts: {
  room?: { id: string; status: string } | null;
  reports?: Array<{ id: string; concernsMinor: boolean }>;
  latest?: { action: string; targetId: string } | null;
  vetted?: boolean;
}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    banterRoom: { findUnique: jest.fn().mockResolvedValue(opts.room ?? null) },
    report: { findMany: jest.fn().mockResolvedValue(opts.reports ?? []) },
    adminActionLog: {
      findFirst: jest.fn().mockResolvedValue(opts.latest ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...tx,
    adminUser: { findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? false }) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const banter = { setRoomStatus: jest.fn().mockResolvedValue(undefined) };
  const moderation = {
    assertVettedToActOn: jest.fn(async (report: { concernsMinor: boolean }) => {
      if (report.concernsMinor && !(opts.vetted ?? false)) {
        throw new ForbiddenException({ code: CHILD_SAFETY_VETTING_REQUIRED_CODE });
      }
    }),
  };
  const service = new BanterRoomReactivationService(prisma as never, banter as never, moderation as never);
  return { service, prisma, tx, banter, moderation };
}

const DEACTIVATED = (reportId = 'rep-1') => ({ action: ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED, targetId: reportId });

describe('BanterRoomReactivationService.reactivate', () => {
  it('404s for an unknown room, writing nothing', async () => {
    const { service, banter, tx } = build({ room: null });
    await expect(service.reactivate('nope', 'admin-1', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(banter.setRoomStatus).not.toHaveBeenCalled();
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('409s with a stable code when the room is already active', async () => {
    const { service, banter } = build({ room: { id: 'room-1', status: 'active' } });
    const err = await service.reactivate('room-1', 'admin-1', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: ROOM_ALREADY_ACTIVE_CODE });
    expect(banter.setRoomStatus).not.toHaveBeenCalled();
  });

  it('409s when the room is inactive but staff never deactivated it (the creator did)', async () => {
    const { service, banter } = build({ room: { id: 'room-1', status: 'inactive' }, reports: [], latest: null });
    const err = await service.reactivate('room-1', 'admin-1', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: ROOM_NOT_STAFF_DEACTIVATED_CODE });
    expect(banter.setRoomStatus).not.toHaveBeenCalled();
  });

  it('409s when the latest event is a staff reactivation (staff deactivated, staff reactivated, creator switched it off)', async () => {
    const { service } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: false }],
      latest: { action: ADMIN_ACTION_LOG_ACTIONS.BANTER_ROOM_REACTIVATED, targetId: 'room-1' },
    });
    await expect(service.reactivate('room-1', 'admin-1', {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivates a staff-deactivated room through setRoomStatus and audits it, naming the report and the note', async () => {
    const { service, banter, tx } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: false }],
      latest: DEACTIVATED('rep-1'),
    });
    const result = await service.reactivate('room-1', 'admin-1', { note: '  Reported in error  ' });

    expect(result).toEqual({ id: 'room-1', status: 'active' });
    expect(banter.setRoomStatus).toHaveBeenCalledWith(tx, 'room-1', 'active');
    expect(tx.adminActionLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: ADMIN_ACTION_LOG_ACTIONS.BANTER_ROOM_REACTIVATED,
        targetType: 'banter_room',
        targetId: 'room-1',
        notes: 'report=rep-1; note=Reported in error',
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('a blank note counts as none', async () => {
    const { service, tx } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: false }],
      latest: DEACTIVATED('rep-1'),
    });
    await service.reactivate('room-1', 'admin-1', { note: '   ' });
    expect(tx.adminActionLog.create.mock.calls[0][0].data.notes).toBe('report=rep-1');
  });

  it('a deactivation on a child-safety report needs a vetted admin: the unvetted get the coded 403, nothing written', async () => {
    const { service, banter, tx } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: true }],
      latest: DEACTIVATED('rep-1'),
      vetted: false,
    });
    const err = await service.reactivate('room-1', 'admin-1', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: CHILD_SAFETY_VETTING_REQUIRED_CODE });
    expect(banter.setRoomStatus).not.toHaveBeenCalled();
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('a vetted admin may reactivate a child-safety deactivation', async () => {
    const { service, banter } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: true }],
      latest: DEACTIVATED('rep-1'),
      vetted: true,
    });
    await service.reactivate('room-1', 'admin-1', {});
    expect(banter.setRoomStatus).toHaveBeenCalledTimes(1);
  });

  it('the vetting gate uses the report that deactivated the room, not another report on the same room', async () => {
    const { service, moderation } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [
        { id: 'rep-1', concernsMinor: false },
        { id: 'rep-2', concernsMinor: true },
      ],
      latest: DEACTIVATED('rep-1'),
      vetted: false,
    });
    await service.reactivate('room-1', 'admin-1', {});
    expect(moderation.assertVettedToActOn).toHaveBeenCalledWith(
      { concernsMinor: false, targetType: 'banter_room', targetId: 'room-1' },
      'admin-1',
    );
  });

  it('re-checks under the lock: a second staff member who lost the race gets 409 and writes nothing', async () => {
    const { service, tx, banter } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: false }],
      latest: DEACTIVATED('rep-1'),
    });
    // Outside the lock the room still reads inactive; inside, the winner already made it active.
    tx.banterRoom.findUnique
      .mockResolvedValueOnce({ id: 'room-1', status: 'inactive' })
      .mockResolvedValueOnce({ status: 'active' });
    await expect(service.reactivate('room-1', 'admin-2', {})).rejects.toBeInstanceOf(ConflictException);
    expect(banter.setRoomStatus).not.toHaveBeenCalled();
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
  });
});

describe('BanterRoomReactivationService.describeRoom', () => {
  it('returns null when the room is gone', async () => {
    const { service } = build({ room: null });
    expect(await service.describeRoom('nope', 'admin-1')).toBeNull();
  });

  it('an active room: nothing to reactivate', async () => {
    const { service } = build({ room: { id: 'room-1', status: 'active' } });
    expect(await service.describeRoom('room-1', 'admin-1')).toEqual({
      id: 'room-1',
      status: 'active',
      staffMayReactivate: false,
    });
  });

  it('inactive and staff-deactivated: staff may reactivate', async () => {
    const { service } = build({
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: false }],
      latest: DEACTIVATED('rep-1'),
    });
    expect(await service.describeRoom('room-1', 'admin-1')).toEqual({
      id: 'room-1',
      status: 'inactive',
      staffMayReactivate: true,
    });
  });

  it('inactive but switched off by the creator: staff may not', async () => {
    const { service } = build({ room: { id: 'room-1', status: 'inactive' }, reports: [], latest: null });
    expect(await service.describeRoom('room-1', 'admin-1')).toEqual({
      id: 'room-1',
      status: 'inactive',
      staffMayReactivate: false,
    });
  });

  it('a child-safety deactivation is not offered to an unvetted admin, and is to a vetted one', async () => {
    const base = {
      room: { id: 'room-1', status: 'inactive' },
      reports: [{ id: 'rep-1', concernsMinor: true }],
      latest: DEACTIVATED('rep-1'),
    };
    expect((await build({ ...base, vetted: false }).service.describeRoom('room-1', 'a'))?.staffMayReactivate).toBe(false);
    expect((await build({ ...base, vetted: true }).service.describeRoom('room-1', 'a'))?.staffMayReactivate).toBe(true);
  });
});
