// sprint-5/admin-media-storage-backend — a small, provider-agnostic file
// storage abstraction, deliberately NOT a concrete S3 client type. Mirrors
// this codebase's existing "inject the abstraction, not the vendor SDK"
// precedent (RedisService wraps ioredis; PrismaService wraps @prisma/client)
// so a caller (AdminMediaService today; Article's own eventual image
// upload, per media/README.md's own "explicitly not built here" note,
// tomorrow) never talks to an S3 SDK directly.
//
// An ABSTRACT CLASS, not a plain TS `interface` + string/Symbol injection
// token — NestJS resolves an abstract class as a real DI token on its own,
// so `useClass: S3StorageService` (storage.module.ts) just works, and a
// unit test can pass any object satisfying this shape cast `as
// StorageService` without needing a Nest TestingModule at all (the same
// "construct the service directly with a fake dependency" convention this
// codebase's other `*.service.spec.ts` files already use — see
// admin-content.service.spec.ts's own `new AdminContentService(prisma)`).
export abstract class StorageService {
  /**
   * Uploads `buffer` under `key` and returns the resulting publicly
   * fetchable URL. `key` is the caller's concern (AdminMediaService owns
   * key-naming policy) — this method just stores whatever bytes it's
   * given under whatever key it's given.
   */
  abstract upload(buffer: Buffer, key: string, contentType: string): Promise<string>;

  /**
   * Deletes the object at `key`. Not called by any endpoint in this PR
   * (no DELETE /admin/media/:id route exists yet — see
   * media/README.md's "What this PR does NOT do") but part of the
   * abstraction from day one, per this PR's own task brief, so a future
   * delete endpoint (or a future Article-image-replacement flow) has a
   * real, already-tested primitive to call rather than reaching past
   * this abstraction into a vendor SDK directly.
   */
  abstract delete(key: string): Promise<void>;
}
