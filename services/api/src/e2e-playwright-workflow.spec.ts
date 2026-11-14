import * as fs from 'fs';
import * as path from 'path';

// Founder decision 2026-11-14 (build-register B-134): the Playwright suite runs in CI ON DEMAND ONLY. It takes about
// 40 minutes, so it must never run on pull requests, pushes or a schedule, must never become a required check, and
// needs no secrets (the suite uses local fakes). This spec reads the workflow as text, same style as
// render-static-sites.spec.ts, and fails if any of that drifts. It cannot prove the workflow runs on GitHub; the
// first run has to be started by hand from the Actions tab after the file is on the default branch.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const workflowPath = path.join(REPO_ROOT, '.github', 'workflows', 'e2e-playwright.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');
const ci = fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

// Lines of the top-level `on:` block, so a trigger name inside a comment or a step cannot confuse the checks.
function onBlock(): string[] {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  if (start < 0) throw new Error('e2e-playwright.yml has no top-level "on:" block');
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break; // next top-level key
    out.push(lines[i]);
  }
  return out;
}

describe('.github/workflows/e2e-playwright.yml', () => {
  it('is triggered by workflow_dispatch and by nothing else', () => {
    const triggers = onBlock()
      .map((l) => /^ {2}([a-z_]+):/.exec(l)?.[1])
      .filter((t): t is string => Boolean(t));
    expect(triggers).toEqual(['workflow_dispatch']);
  });

  it('never names a pull request, push, schedule or other automatic trigger anywhere as a YAML key', () => {
    const automatic = /^\s*(pull_request|pull_request_target|push|schedule|workflow_run|repository_dispatch|release|issue_comment|check_suite|status):/m;
    expect(automatic.test(workflow)).toBe(false);
  });

  it('uses no secrets and asks for no write permission', () => {
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
    expect(workflow).not.toMatch(/GITHUB_TOKEN/);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow).not.toMatch(/^\s*[a-z-]+: write\s*$/m);
  });

  it('queues a second dispatch instead of overlapping it or cancelling the first', () => {
    expect(workflow).toMatch(/^concurrency:\n {2}group: e2e-playwright\n {2}cancel-in-progress: false\n/m);
  });

  it('has a job timeout and a tighter test-step timeout, so the artifact upload still runs after a hang', () => {
    expect(workflow).toMatch(/^ {4}timeout-minutes: \d+/m);
    expect(workflow).toMatch(/^ {8}timeout-minutes: \d+/m);
  });

  it('uploads results, logs and failure artifacts even when the run fails, including the hidden .run directory', () => {
    expect(workflow).toMatch(/if: always\(\)\n\s+uses: actions\/upload-artifact@/);
    expect(workflow).toMatch(/include-hidden-files: true/);
    expect(workflow).toContain('e2e/.run/results.json');
    expect(workflow).toContain('e2e/.run/*.log');
    expect(workflow).toContain('e2e/.run/artifacts/');
  });

  it('takes the two inputs the founder asked for, and passes them through environment variables', () => {
    expect(workflow).toMatch(/^ {6}spec_filter:/m);
    expect(workflow).toMatch(/^ {6}test_clock_iso:/m);
    expect(workflow).toMatch(/SPEC_FILTER: \$\{\{ inputs\.spec_filter \}\}/);
    expect(workflow).toMatch(/QA_TEST_CLOCK_ISO: \$\{\{ inputs\.test_clock_iso \}\}/);
    // never pasted into a shell command
    expect(workflow).not.toMatch(/run:.*\$\{\{\s*inputs\./);
  });

  it('is not part of ci.yml, so it cannot become one of its required checks', () => {
    expect(ci).not.toMatch(/playwright/i);
    expect(ci).not.toContain('e2e-playwright');
  });
});
