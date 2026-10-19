import * as fs from 'fs';
import { expect, type Browser, type Page } from '@playwright/test';
import { ADMIN_CREDENTIALS, ADMIN_STORAGE_STATE, URLS } from './stack';

// One real UI sign-in per run (the admin login is throttled to 5 / 15 min); every
// later admin page reuses the saved storage state. Shared by the specs that drive
// the admin console (05 incorrect-details reports, 08 user detail / DOB / revoke).
export async function ensureAdminState(browser: Browser): Promise<void> {
  if (fs.existsSync(ADMIN_STORAGE_STATE)) return;
  const ctx = await browser.newContext({ baseURL: URLS.admin });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_CREDENTIALS.email);
  await page.getByLabel('Password').fill(ADMIN_CREDENTIALS.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await ctx.storageState({ path: ADMIN_STORAGE_STATE });
  await ctx.close();
}

export async function adminPage(browser: Browser): Promise<Page> {
  await ensureAdminState(browser);
  const ctx = await browser.newContext({ storageState: ADMIN_STORAGE_STATE, baseURL: URLS.admin });
  return ctx.newPage();
}
