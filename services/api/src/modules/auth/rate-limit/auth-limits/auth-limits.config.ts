import { AUTH_LIMIT_DEFAULTS as D } from './auth-limits.constants';

export interface ConfigReader {
  get(key: string): string | undefined;
}

export interface AuthLimitNumbers {
  signupMax: number;
  signupWindowMs: number;
  loginFailedMax: number;
  loginFailedWindowMs: number;
  accountCeilingMax: number;
  accountCeilingWindowMs: number;
  ipCeilingMax: number;
  ipCeilingWindowMs: number;
  forgotEmailMax: number;
  forgotEmailWindowMs: number;
}

// A positive whole number, else the default. A blank, zero, negative or non-numeric value falls back to the
// default instead of silently disabling a limit.
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
}

// Every name is spelled out as a literal so src/env-completeness.spec.ts (B-018) can see it and fail the
// build if render.yaml or .env.example lacks one.
export function readAuthLimitNumbers(config: ConfigReader): AuthLimitNumbers {
  return {
    signupMax: positiveInt(config.get('AUTH_SIGNUP_RATE_LIMIT_MAX'), D.signupMax),
    signupWindowMs: positiveInt(config.get('AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS'), D.signupWindowMs),
    loginFailedMax: positiveInt(config.get('AUTH_LOGIN_FAILED_ATTEMPTS_MAX'), D.loginFailedMax),
    loginFailedWindowMs: positiveInt(config.get('AUTH_LOGIN_FAILED_ATTEMPTS_WINDOW_MS'), D.loginFailedWindowMs),
    accountCeilingMax: positiveInt(config.get('AUTH_LOGIN_ACCOUNT_CEILING_MAX'), D.accountCeilingMax),
    accountCeilingWindowMs: positiveInt(config.get('AUTH_LOGIN_ACCOUNT_CEILING_WINDOW_MS'), D.accountCeilingWindowMs),
    ipCeilingMax: positiveInt(config.get('AUTH_IP_CEILING_MAX'), D.ipCeilingMax),
    ipCeilingWindowMs: positiveInt(config.get('AUTH_IP_CEILING_WINDOW_MS'), D.ipCeilingWindowMs),
    forgotEmailMax: positiveInt(config.get('AUTH_FORGOT_PASSWORD_EMAIL_MAX'), D.forgotEmailMax),
    forgotEmailWindowMs: positiveInt(config.get('AUTH_FORGOT_PASSWORD_EMAIL_WINDOW_MS'), D.forgotEmailWindowMs),
  };
}
