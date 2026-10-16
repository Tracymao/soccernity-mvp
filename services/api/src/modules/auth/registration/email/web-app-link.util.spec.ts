import { buildWebAppLink } from './web-app-link.util';

describe('buildWebAppLink', () => {
  it('builds an https link with the token encoded', () => {
    expect(buildWebAppLink('https://app.soccernity.com', '/verify-email', { token: 'a b/c' })).toBe(
      'https://app.soccernity.com/verify-email?token=a+b%2Fc',
    );
  });

  it('tolerates a trailing slash and keeps a path prefix', () => {
    expect(buildWebAppLink('https://x.com/', '/p', { token: 't' })).toBe('https://x.com/p?token=t');
    expect(buildWebAppLink('https://x.com/app/', '/p', { token: 't' })).toBe('https://x.com/app/p?token=t');
  });

  it('allows http only for localhost', () => {
    expect(buildWebAppLink('http://localhost:5173', '/p', { token: 't' })).toBe('http://localhost:5173/p?token=t');
    expect(buildWebAppLink('http://127.0.0.1:5173', '/p', { token: 't' })).toBe('http://127.0.0.1:5173/p?token=t');
    expect(buildWebAppLink('http://app.soccernity.com', '/p', { token: 't' })).toBeNull();
  });

  it.each([
    ['unset', undefined],
    ['null', null],
    ['blank', '   '],
    ['not a URL', 'soccernity.com'],
    ['placeholder host', 'https://app.soccernity.example'],
    ['replace-me', 'https://replace-me'],
    ['ftp', 'ftp://soccernity.com'],
  ])('returns null for %s', (_label, base) => {
    expect(buildWebAppLink(base as string | undefined | null, '/p', { token: 't' })).toBeNull();
  });

  it('ignores a query or fragment on the base', () => {
    expect(buildWebAppLink('https://x.com/?a=1#frag', '/p', { token: 't' })).toBe('https://x.com/p?token=t');
  });
});
