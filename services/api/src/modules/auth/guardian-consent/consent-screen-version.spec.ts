import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CONSENT_SCREEN_TEXT_HASH, CONSENT_SCREEN_VERSION } from './consent-screen-version.constants';
import { extractConsentText, hashConsentText } from './consent-screen-text-hash.util';

// Low-tech tripwire, NOT an auto-bumper: a human must decide whether a
// wording change altered what the guardian consents to (bump the version)
// or not (typo fix: update only the recorded hash).
const PAGE = resolve(__dirname, '../../../../../../apps/web/src/pages/GuardianConsentConfirmPage.tsx');
const source = readFileSync(PAGE, 'utf8');

// What the guard itself is. Compares a candidate (source, version, recorded
// hash) triple; returns a failure message or null.
function checkTripwire(src: string, version: string, recordedHash: string, recordedForVersion: string): string | null {
  if (hashConsentText(src) === recordedHash && version === recordedForVersion) return null;
  return (
    'GuardianConsentConfirmPage.tsx consent wording no longer matches CONSENT_SCREEN_TEXT_HASH. ' +
    'If the change alters what the guardian is told or agrees to, bump CONSENT_SCREEN_VERSION ' +
    'and update CONSENT_SCREEN_TEXT_HASH in consent-screen-version.constants.ts in the same PR. ' +
    'If it is only a typo/meaning-neutral fix, update just the hash (Decision Log #348).'
  );
}

describe('consent screen version tripwire', () => {
  it('recorded hash matches the current GuardianConsentConfirmPage.tsx wording', () => {
    const current = hashConsentText(source);
    if (current !== CONSENT_SCREEN_TEXT_HASH) {
      throw new Error(
        'GuardianConsentConfirmPage.tsx consent wording changed but CONSENT_SCREEN_TEXT_HASH was not updated.\n' +
          `Current hash: ${current}\n` +
          `Recorded (CONSENT_SCREEN_VERSION=${CONSENT_SCREEN_VERSION}): ${CONSENT_SCREEN_TEXT_HASH}\n` +
          'If the change alters what the guardian is told or agrees to, bump CONSENT_SCREEN_VERSION AND ' +
          'update CONSENT_SCREEN_TEXT_HASH in consent-screen-version.constants.ts in the same PR. ' +
          'If it is a meaning-neutral fix (typo), update only the hash.',
      );
    }
  });

  it('extracts real wording (guards against an extractor that silently matches nothing)', () => {
    const text = extractConsentText(source);
    expect(text).toContain('whattheaccountholderwillbeabletodo');
    expect(text).toContain('publicsearchenginelisting');
    expect(text).toContain('idonotconsent');
    expect(text).not.toContain('consentpage__column');
  });

  it('FAILS when the wording is changed without updating the recorded hash/version', () => {
    const edited = source.replace('Targeted advertising', 'Personalised advertising');
    expect(edited).not.toBe(source);
    const msg = checkTripwire(edited, CONSENT_SCREEN_VERSION, CONSENT_SCREEN_TEXT_HASH, CONSENT_SCREEN_VERSION);
    expect(msg).toContain('bump CONSENT_SCREEN_VERSION');
  });

  it('PASSES when wording, version and recorded hash are all updated together', () => {
    const edited = source.replace('Targeted advertising', 'Personalised advertising');
    const newHash = hashConsentText(edited);
    expect(newHash).not.toBe(CONSENT_SCREEN_TEXT_HASH);
    expect(checkTripwire(edited, 'v2', newHash, 'v2')).toBeNull();
  });

  it('does NOT trip on whitespace, punctuation, casing, class names or comments', () => {
    const edited = source
      .replace('Build a player profile', 'BUILD  a player profile.')
      .replace('consent-page__column', 'consent-page__col2')
      .replace('// Route: /guardian-consent/confirm', '// Route (edited): /guardian-consent/confirm');
    expect(hashConsentText(edited)).toBe(hashConsentText(source));
  });

  it('DOES trip on a one-letter typo fix (documented false positive)', () => {
    const edited = source.replace('Build a player profile', 'Build a player profil');
    expect(hashConsentText(edited)).not.toBe(hashConsentText(source));
  });
});
