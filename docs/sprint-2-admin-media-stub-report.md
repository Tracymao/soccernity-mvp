# Sprint 2 — apps/admin PR 7: Media (disclosed stubs)

**Branch:** `sprint-2/admin-media-stub` — stacks on PR 6 (`sprint-2/admin-users-stub`, #197).
**Figma:** `361:553` (library), `396:442` (preview), `916:2362` + `917:24` (upload step 1 / 2).

## Why stubs

`GET /admin/media` / `POST /admin/media/upload` are not built, **and no file storage is configured anywhere** (Build Plan Section 4.8; S3 is wired but not live per CLAUDE.md). Nothing here can be functional even in principle yet.

## What this PR ships

| Screen | Route | Reproduced |
|---|---|---|
| Media library | `/media` | sample uploaded-media table (Name / Time / Size) + Add Media link + preview link |
| Media preview | `/media/preview` | empty "Preview — no media" pane + sample metadata line |
| Media upload | `/media/upload` | both Figma steps as one disabled form — dropzone copy, sample selected-files list, disabled Upload |

Dashed banners name both the missing endpoints and the missing storage.

## Verification

- apps/admin vitest — **13 files / 47 tests, 0 failures** (`media.test.tsx` +3)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #237.** Not merged — founder's call. Next: PR 8 `sprint-2/admin-competitions-stub`.
