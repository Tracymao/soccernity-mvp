import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { ProfileImageViewService } from './profile-image-view.service';

// backend/b036-avatar-cover-check: the OWNER's URL for a picture.
const storage = (over: Partial<DirectUploadStorageService> = {}) =>
  ({ createDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/x'), ...over }) as unknown as DirectUploadStorageService;

describe('ProfileImageViewService.ownerUrl', () => {
  it('an approved, published picture gets its public URL and no link is made', async () => {
    const s = storage();
    const url = await new ProfileImageViewService(s).ownerUrl({
      url: 'https://cdn/profile-media/u1/a.jpg',
      key: 'profile-media/u1/a.jpg',
      status: 'approved',
    });
    expect(url).toBe('https://cdn/profile-media/u1/a.jpg');
    expect(s.createDownloadUrl).not.toHaveBeenCalled();
  });

  it.each(['pending', 'rejected'])('a %s picture gets a signed link to its PRIVATE file, valid 5 minutes', async (status) => {
    const s = storage();
    const url = await new ProfileImageViewService(s).ownerUrl({
      url: 'https://cdn/profile-media/u1/a.jpg',
      key: 'private-profile/u1/a.jpg',
      status,
    });
    expect(url).toBe('https://signed.example/x');
    expect(s.createDownloadUrl).toHaveBeenCalledWith('private-profile/u1/a.jpg', 300);
  });

  it('an approved picture whose file is not published yet is still given a signed link, never the public URL', async () => {
    const url = await new ProfileImageViewService(storage()).ownerUrl({
      url: 'https://cdn/profile-media/u1/a.jpg',
      key: 'private-profile/u1/a.jpg',
      status: 'approved',
    });
    expect(url).toBe('https://signed.example/x');
  });

  it('nothing stored gives null; a link that cannot be made gives null; no store gives null', async () => {
    const view = new ProfileImageViewService(storage());
    expect(await view.ownerUrl({ url: null, key: null, status: null })).toBeNull();
    expect(await view.ownerUrl({ url: 'u', key: null, status: 'pending' })).toBeNull();
    const down = new ProfileImageViewService(storage({ createDownloadUrl: jest.fn().mockRejectedValue(new Error('down')) }));
    expect(await down.ownerUrl({ url: 'u', key: 'private-profile/u1/a.jpg', status: 'pending' })).toBeNull();
    expect(await new ProfileImageViewService().ownerUrl({ url: 'u', key: 'private-profile/u1/a.jpg', status: 'pending' })).toBeNull();
  });
});
