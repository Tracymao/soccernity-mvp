import {
  CONTENT_REMOVAL_TARGET_TYPES,
  applyContentRemoval,
  isContentRemovalTarget,
  restoreContentRemoval,
} from './content-removal.util';

// B-289 (Decision Log #483). The removal and restore primitives against a mock transaction client; the real SQL is
// proved in test/content-removal.e2e-spec.ts.
const NOW = new Date('2026-11-10T09:00:00.000Z');

function tx() {
  return {
    post: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    comment: { updateMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    message: { updateMany: jest.fn(), findUnique: jest.fn() },
  };
}
type Tx = ReturnType<typeof tx>;
const asTx = (t: Tx) => t as never;
const ref = (targetType: string) => ({ id: 'report-1', targetType, targetId: 'target-1' });

describe('content-removal.util', () => {
  it('offers content_removed for exactly post, comment and message', () => {
    expect([...CONTENT_REMOVAL_TARGET_TYPES].sort()).toEqual(['comment', 'message', 'post']);
    for (const t of ['post', 'comment', 'message']) expect(isContentRemovalTarget(t)).toBe(true);
    for (const t of ['user', 'banter_room', 'grassroots_team', 'fixture', 'enquiry', 'article', '']) {
      expect(isContentRemovalTarget(t)).toBe(false);
    }
  });

  describe('applyContentRemoval', () => {
    it.each(['post', 'message'] as const)('claims a %s with a guarded updateMany and reports removed', async (type) => {
      const t = tx();
      (t[type].updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(applyContentRemoval(asTx(t), ref(type), NOW)).resolves.toBe('removed');
      expect(t[type].updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', removedByModerationAt: null },
        data: { removedByModerationAt: NOW, removedByReportId: 'report-1' },
      });
    });

    it.each(['post', 'message'] as const)('%s: already removed by another report is left alone', async (type) => {
      const t = tx();
      (t[type].updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (t[type].findUnique as jest.Mock).mockResolvedValue({ id: 'target-1' });
      await expect(applyContentRemoval(asTx(t), ref(type), NOW)).resolves.toBe('already_removed');
    });

    it.each(['post', 'message'] as const)('%s: a row that is gone is target_not_found', async (type) => {
      const t = tx();
      (t[type].updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (t[type].findUnique as jest.Mock).mockResolvedValue(null);
      await expect(applyContentRemoval(asTx(t), ref(type), NOW)).resolves.toBe('target_not_found');
    });

    it('comment: claims it and decrements commentCount (floor-guarded) when it is visible', async () => {
      const t = tx();
      (t.comment.findUnique as jest.Mock).mockResolvedValue({ id: 'target-1', postId: 'post-9', hidden: false });
      (t.comment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(applyContentRemoval(asTx(t), ref('comment'), NOW)).resolves.toBe('removed');
      expect(t.post.updateMany).toHaveBeenCalledWith({
        where: { id: 'post-9', commentCount: { gt: 0 } },
        data: { commentCount: { decrement: 1 } },
      });
    });

    it('comment: a hidden comment is not subtracted a second time', async () => {
      const t = tx();
      (t.comment.findUnique as jest.Mock).mockResolvedValue({ id: 'target-1', postId: 'post-9', hidden: true });
      (t.comment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(applyContentRemoval(asTx(t), ref('comment'), NOW)).resolves.toBe('removed');
      expect(t.post.updateMany).not.toHaveBeenCalled();
    });

    it('comment: already removed changes no counter; a missing comment is target_not_found', async () => {
      const t = tx();
      (t.comment.findUnique as jest.Mock).mockResolvedValue({ id: 'target-1', postId: 'post-9', hidden: false });
      (t.comment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(applyContentRemoval(asTx(t), ref('comment'), NOW)).resolves.toBe('already_removed');
      expect(t.post.updateMany).not.toHaveBeenCalled();
      (t.comment.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(applyContentRemoval(asTx(t), ref('comment'), NOW)).resolves.toBe('target_not_found');
    });

    it('only ever touches the one target id (a context message is never part of the call)', async () => {
      const t = tx();
      (t.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await applyContentRemoval(asTx(t), ref('message'), NOW);
      expect(t.message.updateMany).toHaveBeenCalledTimes(1);
      expect((t.message.updateMany as jest.Mock).mock.calls[0][0].where.id).toBe('target-1');
    });

    it('any other target type does nothing', async () => {
      const t = tx();
      await expect(applyContentRemoval(asTx(t), ref('user'), NOW)).resolves.toBe('target_not_found');
      expect(t.post.updateMany).not.toHaveBeenCalled();
      expect(t.message.updateMany).not.toHaveBeenCalled();
      expect(t.comment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('restoreContentRemoval', () => {
    const cleared = { removedByModerationAt: null, removedByReportId: null };

    it.each(['post', 'message'] as const)('%s: clears the columns only where THIS report is the remover', async (type) => {
      const t = tx();
      (t[type].updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(restoreContentRemoval(asTx(t), ref(type))).resolves.toBe(true);
      expect(t[type].updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', removedByReportId: 'report-1' },
        data: cleared,
      });
      (t[type].updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(restoreContentRemoval(asTx(t), ref(type))).resolves.toBe(false);
    });

    it('comment: restores and counts it again unless hidden; another report claim is left', async () => {
      const t = tx();
      (t.comment.findFirst as jest.Mock).mockResolvedValue({ id: 'target-1', postId: 'post-9', hidden: false });
      (t.comment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(restoreContentRemoval(asTx(t), ref('comment'))).resolves.toBe(true);
      expect(t.comment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'target-1', removedByReportId: 'report-1' } }),
      );
      expect(t.post.update).toHaveBeenCalledWith({ where: { id: 'post-9' }, data: { commentCount: { increment: 1 } } });

      const hidden = tx();
      (hidden.comment.findFirst as jest.Mock).mockResolvedValue({ id: 'target-1', postId: 'post-9', hidden: true });
      (hidden.comment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      await restoreContentRemoval(asTx(hidden), ref('comment'));
      expect(hidden.post.update).not.toHaveBeenCalled();

      const other = tx();
      (other.comment.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(restoreContentRemoval(asTx(other), ref('comment'))).resolves.toBe(false);
      expect(other.comment.updateMany).not.toHaveBeenCalled();
    });
  });
});
