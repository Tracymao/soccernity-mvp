// CH-H18: the HTML template must not change a single byte of any plain-text body. The snapshot beside this file was
// written by running this spec against the code BEFORE the template was added.
import type { ConfigService } from '@nestjs/config';
import { emailSamples } from '../../../../scripts/email-preview-samples';
import { PasswordResetEmailService } from '../../password-reset/email/password-reset-email.service';
import { RegistrationEmailService, RegistrationEmailTemplate } from './registration-email.service';

const mockSendEmail = jest.fn();
jest.mock('postmark', () => ({ ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })) }));

const values: Record<string, string> = {
  EMAIL_PROVIDER_API_KEY: 'test-key',
  POSTMARK_FROM_EMAIL: 'no-reply@soccernity.com',
  WEB_APP_BASE_URL: 'https://app.soccernity.com',
};
const config = { get: (key: string) => values[key] } as unknown as ConfigService;
const samples = emailSamples('https://app.soccernity.com');

describe('plain-text email bodies', () => {
  beforeEach(() => mockSendEmail.mockReset().mockResolvedValue({ MessageID: 'm' }));

  it.each(Object.keys(samples) as RegistrationEmailTemplate[])('%s is unchanged', async (template) => {
    const { subject, data } = samples[template];
    const service = new RegistrationEmailService(config);
    await (service as unknown as { dispatch(e: unknown): Promise<void> }).dispatch({
      to: 'a@example.com',
      subject,
      template,
      data,
    });
    expect(mockSendEmail.mock.calls[0][0].TextBody).toMatchSnapshot();
  });

  it('appeal-decision (overturned) is unchanged', async () => {
    await new RegistrationEmailService(config).sendAppealDecisionEmail('a@example.com', 'overturned');
    expect(mockSendEmail.mock.calls[0][0].TextBody).toMatchSnapshot();
  });

  it('password-reset is unchanged', async () => {
    await new PasswordResetEmailService(config).sendPasswordResetEmail('a@example.com', 'sample');
    expect(mockSendEmail.mock.calls[0][0].TextBody).toMatchSnapshot();
  });
});
