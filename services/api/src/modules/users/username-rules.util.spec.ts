import { checkUsernameRules, clubComparableForm, normalisedForms, squash } from './username-rules.util';

describe('username rules (B-032, pure)', () => {
  describe('normalisation', () => {
    it('squash lower-cases and drops underscores', () => {
      expect(squash('Big_Fan_9')).toBe('bigfan9');
    });

    it('reads digits as letters AND as decoration, and 1 as both i and l', () => {
      const forms = normalisedForms('adm1n');
      expect(forms).toEqual(expect.arrayContaining(['admin']));
      expect(normalisedForms('admin2024')).toEqual(expect.arrayContaining(['admin']));
      expect(normalisedForms('4dmin')).toEqual(expect.arrayContaining(['admin']));
      expect(normalisedForms('a1l')).toEqual(expect.arrayContaining(['ail', 'all']));
    });
  });

  describe('format-level', () => {
    it('refuses a handle with no letter at all', () => {
      expect(checkUsernameRules('12345678')).toBe('no_letters');
      expect(checkUsernameRules('___123')).toBe('no_letters');
    });

    it('allows ordinary handles', () => {
      for (const ok of ['goalie_9', 'ToriStriker', 'mid_fielder_77', 'tunde10', 'lagos_ballers']) {
        expect(checkUsernameRules(ok)).toBeNull();
      }
    });
  });

  describe('reserved words and impersonation of Soccernity / staff', () => {
    it.each(['admin', 'Admin', 'ADMIN_', 'moderator', 'support', 'staff', 'official', 'null', 'undefined', 'member'])(
      'refuses the reserved handle %s',
      (handle) => {
        expect(checkUsernameRules(handle)).toBe('reserved');
      },
    );

    it.each(['adm1n', '4dmin', 'admin2024', 'a_d_m_i_n', 'realadmin', 'supportteam', 'admin_official', 'the_moderator', 'S0ccernity_fan'])(
      'sees through digits, underscores and noise words: %s',
      (handle) => {
        expect(checkUsernameRules(handle)).toBe('reserved');
      },
    );

    it('refuses the platform name anywhere in the handle', () => {
      expect(checkUsernameRules('soccernity')).toBe('reserved');
      expect(checkUsernameRules('i_love_soccernity_9')).toBe('reserved');
    });

    it('does not refuse a handle that merely contains a reserved word inside another word', () => {
      expect(checkUsernameRules('badminton_pro')).toBeNull();
      expect(checkUsernameRules('modest_mouse')).toBeNull();
      expect(checkUsernameRules('teamwork_dreamwork')).toBeNull();
    });
  });

  describe('profanity', () => {
    it('refuses a long offensive term anywhere, through leetspeak and underscores', () => {
      expect(checkUsernameRules('xx_fuck_xx')).toBe('profanity');
      expect(checkUsernameRules('sh1t_player')).toBe('profanity');
      expect(checkUsernameRules('b1tch')).toBe('profanity');
    });

    it('refuses a short ambiguous word only when it IS the word or a whole token', () => {
      expect(checkUsernameRules('dick')).toBe('profanity');
      expect(checkUsernameRules('big_dick_77')).toBe('profanity');
      expect(checkUsernameRules('hitler')).toBe('profanity');
    });

    it('leaves ordinary names that contain a short word alone', () => {
      for (const ok of ['dickson_fc9', 'nazir_10', 'torpedo_7', 'assist_king', 'cumberland_boy', 'classic_9', 'sextus_ball']) {
        expect(checkUsernameRules(ok)).toBeNull();
      }
    });
  });

  describe('contact details', () => {
    it.each(['snapchat_tom', 'tom_whatsapp', 'tom_gmail_com', 'find_me_on_discord', 'insta_tiktok_9'])(
      'refuses %s',
      (handle) => {
        expect(checkUsernameRules(handle)).toBe('contact_details');
      },
    );

    it('does not refuse words that only look like a platform', () => {
      expect(checkUsernameRules('instant_replay')).toBeNull();
    });
  });

  describe('personal data', () => {
    const owner = { displayName: 'Ada Obi', email: 'adaeze.obinna93@example.com', dateOfBirth: new Date('2009-03-02T00:00:00Z') };

    it('refuses phone-number-like digit runs and long digit strings', () => {
      expect(checkUsernameRules('call_me_08012345', {})).toBe('personal_data');
      expect(checkUsernameRules('a1b2c3d4e5f6g7h8', {})).toBe('personal_data');
    });

    it('allows a short number such as a shirt number or a small year-like suffix', () => {
      expect(checkUsernameRules('striker_10', {})).toBeNull();
    });

    it("refuses the user's own full name, either order", () => {
      expect(checkUsernameRules('ada_obi', owner)).toBe('personal_data');
      expect(checkUsernameRules('AdaObi99', owner)).toBe('personal_data');
      expect(checkUsernameRules('obi_ada', owner)).toBe('personal_data');
    });

    it('does not use a name shorter than the minimum', () => {
      expect(checkUsernameRules('jo_scores', { displayName: 'Jo Li' })).toBeNull();
    });

    it("refuses the user's own email local part", () => {
      expect(checkUsernameRules('adaeze_obinna93', owner)).toBe('personal_data');
    });

    it("refuses the user's own birth year or ddmmyy", () => {
      expect(checkUsernameRules('striker2009', owner)).toBe('personal_data');
      expect(checkUsernameRules('fan_020309', owner)).toBe('personal_data');
    });

    it("allows another year, and treats a missing context as nothing to compare", () => {
      expect(checkUsernameRules('striker2010', owner)).toBeNull();
      expect(checkUsernameRules('ada_obi', {})).toBeNull();
    });
  });

  describe('rule order and club comparison form', () => {
    it('reports reserved before profanity before personal data', () => {
      expect(checkUsernameRules('admin', { displayName: 'Admin Person' })).toBe('reserved');
    });

    it('clubComparableForm drops punctuation and a leading/trailing fc or official', () => {
      expect(clubComparableForm('Chelsea_FC')).toBe('chelsea');
      expect(clubComparableForm('fc_barcelona')).toBe('barcelona');
      expect(clubComparableForm('official_arsenal')).toBe('arsenal');
      expect(clubComparableForm('Man_United')).toBe('manunited');
    });
  });
});
