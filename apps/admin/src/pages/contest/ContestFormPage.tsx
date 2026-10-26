// Create a Contest / Edit a Contest -- POST /admin/contest/cycles and PATCH /admin/contest/cycles/:id.
// Figma: Create Contest 6643:21602, Create -- Validation 6643:21973, Edit Contest 6644:21820, Edit --
// Save Error 6644:22188 (pass C, B-095), with the required Title, the week-4-only followers switch and the
// final task from pass F1 (Decision Log #399). Build register B-097.
//
// What the form holds (docs/contest-spec.md section 4):
//   - a required TITLE (max 80) and a description for the Contest page;
//   - a month ("YYYY-MM"): chosen at creation, never editable (dates are never editable) -- the weeks
//     follow the fixed Europe/London calendar and the month must not have started;
//   - the MINIMUM TALLY: required, no default, at least 1. Admin-only; players never see it;
//   - placement points, weekly and monthly, prefilled with the confirmed defaults and editable;
//   - for each of weeks 1-3, a free-text task (no option list) and the view-qualifying watch limit in
//     seconds (3-120, required);
//   - the final's task text (shown at the bottom of the leaderboard page);
//   - the followers-excluded counting switch, WEEK 4 ONLY;
//   - the week-4 exposure settings (tolerance 1-50 %, per-viewer daily cap 1-50), prefilled 10 / 3.
//     The exposure engine itself is not built yet (B-092); the settings are stored and validated.
//
// EDIT LOCKING (spec section 4a): the server decides, and answers GET with an `editable` map so the form
// can disable what is locked: before launch everything but the month is editable; once week 1 starts the
// minimum tally and placement points lock; each week's task and watch limit lock when that week starts;
// the followers switch, tolerance and cap lock when week 4 starts; only the description and the tasks of
// weeks that have not started stay editable. A PATCH sends only what changed, so a locked field is never
// sent.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  CONTEST_DESCRIPTION_MAX_LENGTH,
  CONTEST_TASK_MAX_LENGTH,
  CONTEST_TITLE_MAX_LENGTH,
  EXPOSURE_RANGE_MAX,
  EXPOSURE_RANGE_MIN,
  WATCH_LIMIT_MAX_SECONDS,
  WATCH_LIMIT_MIN_SECONDS,
  createContestCycle,
  getContestCycle,
  updateContestCycle,
  type AdminContestCycleDetail,
  type UpdateCycleInput,
} from "../../api/contest";
import { monthLabel } from "./contestShared";

const DEFAULT_WEEKLY = ["500", "300", "150"];
const DEFAULT_MONTHLY = ["2000", "1200", "600"];

interface WeekState {
  task: string;
  limit: string;
}

interface FormState {
  month: string;
  title: string;
  description: string;
  weeks: WeekState[];
  finalTask: string;
  tally: string;
  weekly: string[];
  monthly: string[];
  followersExcluded: boolean;
  tolerance: string;
  cap: string;
}

/** The next 12 calendar months, "YYYY-MM". A month that has started cannot be created. */
function upcomingMonths(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function emptyForm(): FormState {
  return {
    month: upcomingMonths()[0],
    title: "",
    description: "",
    weeks: [1, 2, 3].map(() => ({ task: "", limit: "" })),
    finalTask: "",
    tally: "",
    weekly: [...DEFAULT_WEEKLY],
    monthly: [...DEFAULT_MONTHLY],
    followersExcluded: false,
    tolerance: "10",
    cap: "3",
  };
}

function fromDetail(detail: AdminContestCycleDetail): FormState {
  const weekRound = (n: number) => detail.rounds.find((r) => r.weekNumber === n);
  return {
    month: detail.cycle.monthKey ?? "",
    title: detail.cycle.title,
    description: detail.cycle.description ?? "",
    weeks: [1, 2, 3].map((n) => ({
      task: weekRound(n)?.task ?? "",
      limit: weekRound(n)?.viewWatchLimitSeconds != null ? String(weekRound(n)?.viewWatchLimitSeconds) : "",
    })),
    finalTask: weekRound(4)?.task ?? "",
    tally: detail.settings.minimumTally != null ? String(detail.settings.minimumTally) : "",
    weekly: detail.settings.weeklyPoints.map(String),
    monthly: detail.settings.monthlyPoints.map(String),
    followersExcluded: detail.settings.followersExcludedWeek4,
    tolerance: String(detail.settings.exposureTolerancePercent),
    cap: String(detail.settings.exposureViewerDailyCap),
  };
}

function isInt(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function inRange(value: string, min: number, max: number): boolean {
  return isInt(value) && Number(value) >= min && Number(value) <= max;
}

export default function ContestFormPage({ mode }: { mode: "create" | "edit" }) {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const editing = mode === "edit";

  const [form, setForm] = useState<FormState>(emptyForm);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<AdminContestCycleDetail | null>(null);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);
  // True once the admin has changed anything. On Create, the per-field messages show from then on, so the
  // admin sees what is missing without having to submit (Create is disabled while the form is invalid).
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    getContestCycle(id)
      .then((d) => {
        if (cancelled) return;
        const next = fromDetail(d);
        setDetail(d);
        setForm(next);
        setOriginal(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn’t load that contest.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, id]);

  const months = useMemo(upcomingMonths, []);
  const e = detail?.editable;
  // A field is editable on create, and on edit only when the server says so.
  const can = (flag: boolean | undefined) => !editing || flag === true;
  const taskEditable = (week: number) => !editing || e?.taskByWeek[week] === true;
  const limitEditable = (week: number) => !editing || e?.watchLimitByWeek[week] === true;
  const finalTaskEditable = !editing || e?.taskByWeek[4] === true;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setWeek = (i: number, patch: Partial<WeekState>) => {
    setDirty(true);
    setForm((f) => ({ ...f, weeks: f.weeks.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  };
  const setPoints = (key: "weekly" | "monthly", i: number, value: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: f[key].map((v, j) => (j === i ? value : v)) }));
  };

  // ---- validation (mirrors the server's DTO rules; the server stays the authority) ----
  const errors = {
    title: !form.title.trim() ? "A contest title is required." : form.title.length > CONTEST_TITLE_MAX_LENGTH ? `Maximum ${CONTEST_TITLE_MAX_LENGTH} characters.` : null,
    tally: !isInt(form.tally) || Number(form.tally) < 1 ? "Enter the minimum tally: at least 1 point. There is no default." : null,
    weeks: form.weeks.map((w, i) => ({
      task: !w.task.trim() ? `Write the week ${i + 1} task.` : w.task.length > CONTEST_TASK_MAX_LENGTH ? `Maximum ${CONTEST_TASK_MAX_LENGTH} characters.` : null,
      limit: !inRange(w.limit, WATCH_LIMIT_MIN_SECONDS, WATCH_LIMIT_MAX_SECONDS)
        ? `Enter ${WATCH_LIMIT_MIN_SECONDS}-${WATCH_LIMIT_MAX_SECONDS} seconds.`
        : null,
    })),
    points: [...form.weekly, ...form.monthly].some((v) => !isInt(v)) ? "Placement points must be whole numbers, 0 or more." : null,
    tolerance: !inRange(form.tolerance, EXPOSURE_RANGE_MIN, EXPOSURE_RANGE_MAX) ? `Enter ${EXPOSURE_RANGE_MIN}-${EXPOSURE_RANGE_MAX} percent.` : null,
    cap: !inRange(form.cap, EXPOSURE_RANGE_MIN, EXPOSURE_RANGE_MAX) ? `Enter ${EXPOSURE_RANGE_MIN}-${EXPOSURE_RANGE_MAX} views.` : null,
  };
  const valid =
    !errors.title &&
    !errors.tally &&
    !errors.points &&
    !errors.tolerance &&
    !errors.cap &&
    errors.weeks.every((w) => !w.task && !w.limit);

  const show = (message: string | null) => ((touched || (!editing && dirty)) && message ? message : null);

  // The one-line reason shown next to a disabled Create button: every field that is still missing or invalid.
  const missing: string[] = [];
  if (errors.title) missing.push("contest title");
  if (errors.tally) missing.push("minimum tally");
  if (errors.points) missing.push("placement points");
  errors.weeks.forEach((w, i) => {
    if (w.task) missing.push(`week ${i + 1} task`);
    if (w.limit) missing.push(`week ${i + 1} watch limit`);
  });
  if (errors.tolerance) missing.push("exposure tolerance");
  if (errors.cap) missing.push("views per viewer per day");

  async function submit() {
    setTouched(true);
    setSaveError(null);
    setSaved(false);
    // Edit only checks fields the server still lets the admin change.
    if (!editing && !valid) return;
    setSaving(true);
    try {
      if (!editing) {
        await createContestCycle({
          month: form.month,
          title: form.title.trim(),
          ...(form.description.trim() ? { description: form.description.trim() } : {}),
          weeks: form.weeks.map((w, i) => ({
            weekNumber: (i + 1) as 1 | 2 | 3,
            task: w.task.trim(),
            viewWatchLimitSeconds: Number(w.limit),
          })),
          ...(form.finalTask.trim() ? { finalTask: form.finalTask.trim() } : {}),
          minimumTally: Number(form.tally),
          placementPoints: {
            weekly: form.weekly.map(Number) as [number, number, number],
            monthly: form.monthly.map(Number) as [number, number, number],
          },
          followersExcludedWeek4: form.followersExcluded,
          exposureTolerancePercent: Number(form.tolerance),
          exposureViewerDailyCap: Number(form.cap),
        });
        navigate("/contest");
        return;
      }

      // Edit: only what changed, so a locked field is never sent.
      const before = original as FormState;
      const patch: UpdateCycleInput = {};
      if (form.title.trim() !== before.title) patch.title = form.title.trim();
      if (form.description.trim() !== before.description.trim()) patch.description = form.description.trim();
      const weekPatches = form.weeks
        .map((w, i) => {
          const entry: { weekNumber: 1 | 2 | 3; task?: string; viewWatchLimitSeconds?: number } = {
            weekNumber: (i + 1) as 1 | 2 | 3,
          };
          if (w.task.trim() !== before.weeks[i].task.trim()) entry.task = w.task.trim();
          if (w.limit !== before.weeks[i].limit) entry.viewWatchLimitSeconds = Number(w.limit);
          return entry;
        })
        .filter((w) => w.task !== undefined || w.viewWatchLimitSeconds !== undefined);
      if (weekPatches.length > 0) patch.weeks = weekPatches;
      if (form.finalTask.trim() !== before.finalTask.trim()) patch.finalTask = form.finalTask.trim();
      if (form.tally !== before.tally) patch.minimumTally = Number(form.tally);
      if (form.weekly.join() !== before.weekly.join() || form.monthly.join() !== before.monthly.join()) {
        patch.placementPoints = {
          weekly: form.weekly.map(Number) as [number, number, number],
          monthly: form.monthly.map(Number) as [number, number, number],
        };
      }
      if (form.followersExcluded !== before.followersExcluded) patch.followersExcludedWeek4 = form.followersExcluded;
      if (form.tolerance !== before.tolerance) patch.exposureTolerancePercent = Number(form.tolerance);
      if (form.cap !== before.cap) patch.exposureViewerDailyCap = Number(form.cap);

      if (Object.keys(patch).length === 0) {
        setSaved(true);
        return;
      }
      const updated = await updateContestCycle(id, patch);
      const next = fromDetail(updated);
      setDetail(updated);
      setForm(next);
      setOriginal(next);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof AdminApiError ? err.message : "Couldn’t save the contest. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? "Edit a Contest" : "Create a Contest";

  return (
    <>
      <AdminPageHeader title={title} hideSearch />
      <div className="ct-page">
        <div className="ct-back">
          <Link to="/contest">← Back to console</Link>
        </div>
        <div className="ct-top-row">
          <h1 className="ct-title">{title}</h1>
        </div>

        {loading ? <p className="ct-loading">Loading the contest…</p> : null}
        {loadError ? (
          <p className="ct-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError ? (
          <div className="ct-form-card">
            {saveError ? (
              <div className="ct-callout ct-callout--alert" role="alert">
                <span className="ct-callout__bar" aria-hidden />
                <p>{saveError}</p>
              </div>
            ) : null}
            {saved ? (
              <p className="ct-success" role="status">
                Saved.
              </p>
            ) : null}
            {editing && e && !e.beforeLaunch ? (
              <p className="ct-note" data-testid="ct-locked-note">
                This contest has started. Some fields are locked and cannot be changed now; they are shown but disabled.
              </p>
            ) : null}

            <h2 className="ct-form-section-title">Contest</h2>
            <label className="ct-field">
              <span className="ct-field__label">Contest title (required)</span>
              <input
                value={form.title}
                onChange={(ev) => set("title", ev.target.value)}
                placeholder="e.g. November Challenge"
                maxLength={CONTEST_TITLE_MAX_LENGTH + 20}
                disabled={!can(e?.title)}
              />
              <span className="ct-field__hint">
                {form.title.length} / {CONTEST_TITLE_MAX_LENGTH} · Maximum {CONTEST_TITLE_MAX_LENGTH} characters.
              </span>
              {show(errors.title) ? <span className="ct-field__error" role="alert">{errors.title}</span> : null}
            </label>

            <label className="ct-field">
              <span className="ct-field__label">Contest month</span>
              {editing ? (
                <input value={monthLabel(form.month) || form.month} disabled aria-label="Contest month" />
              ) : (
                <select value={form.month} onChange={(ev) => set("month", ev.target.value)} aria-label="Contest month">
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              )}
              <span className="ct-field__hint">
                {editing
                  ? "The month cannot be changed."
                  : "Weeks follow the fixed Europe/London calendar. A month that has started cannot be created."}
              </span>
            </label>

            <label className="ct-field">
              <span className="ct-field__label">Contest description</span>
              <textarea
                value={form.description}
                onChange={(ev) => set("description", ev.target.value)}
                placeholder="Describe the contest for players. Shown on the Contest details page."
                maxLength={CONTEST_DESCRIPTION_MAX_LENGTH}
                rows={4}
                disabled={!can(e?.description)}
              />
              <span className="ct-field__hint">Shown to players on the Contest page.</span>
            </label>

            <div className="ct-divider" />
            <h2 className="ct-form-section-title">Minimum tally and placement points</h2>

            <label className="ct-field">
              <span className="ct-field__label">Minimum tally (required)</span>
              <input
                inputMode="numeric"
                value={form.tally}
                onChange={(ev) => set("tally", ev.target.value)}
                placeholder="Enter points"
                disabled={!can(e?.minimumTally)}
              />
              <span className="ct-field__hint">
                Points a finalist needs to be considered for the final top 3. If nobody reaches it there is no winner
                that month. No default. Players never see this number.
              </span>
              {show(errors.tally) ? <span className="ct-field__error" role="alert">{errors.tally}</span> : null}
            </label>

            <div className="ct-points" role="group" aria-label="Placement points">
              <span className="ct-field__label">Placement points</span>
              {(["weekly", "monthly"] as const).map((key) => (
                <div className="ct-points__row" key={key}>
                  <strong>{key === "weekly" ? "Weekly contest" : "Monthly final"}</strong>
                  {[0, 1, 2].map((i) => (
                    <label key={i} className="ct-field">
                      <span className="ct-field__label">{["1st", "2nd", "3rd"][i]}</span>
                      <input
                        inputMode="numeric"
                        value={form[key][i]}
                        onChange={(ev) => setPoints(key, i, ev.target.value)}
                        aria-label={`${key === "weekly" ? "Weekly" : "Monthly"} placement points, ${["1st", "2nd", "3rd"][i]}`}
                        disabled={!can(e?.placementPoints)}
                      />
                    </label>
                  ))}
                </div>
              ))}
              <span className="ct-field__hint">Prefilled with the defaults (weekly 500 / 300 / 150, monthly 2,000 / 1,200 / 600).</span>
              {show(errors.points) ? <span className="ct-field__error" role="alert">{errors.points}</span> : null}
            </div>

            <div className="ct-divider" />
            <h2 className="ct-form-section-title">Weeks</h2>
            {form.weeks.map((w, i) => (
              <div className="ct-week" key={i}>
                <h3 className="ct-week__title">Week {i + 1}</h3>
                <label className="ct-field">
                  <span className="ct-field__label">Weekly task (week {i + 1})</span>
                  <textarea
                    value={w.task}
                    onChange={(ev) => setWeek(i, { task: ev.target.value })}
                    placeholder="Write the challenge and how it works in your own words. The mechanism is free text, there is no option list."
                    maxLength={CONTEST_TASK_MAX_LENGTH}
                    rows={4}
                    disabled={!taskEditable(i + 1)}
                  />
                  {show(errors.weeks[i].task) ? <span className="ct-field__error" role="alert">{errors.weeks[i].task}</span> : null}
                </label>
                <label className="ct-field">
                  <span className="ct-field__label">View-qualifying watch limit, week {i + 1} (required)</span>
                  <input
                    inputMode="numeric"
                    value={w.limit}
                    onChange={(ev) => setWeek(i, { limit: ev.target.value })}
                    placeholder="Enter seconds"
                    disabled={!limitEditable(i + 1)}
                  />
                  <span className="ct-field__hint">
                    Video entries only. A video shorter than the limit must be watched completely. {WATCH_LIMIT_MIN_SECONDS}-{WATCH_LIMIT_MAX_SECONDS} seconds.
                  </span>
                  {show(errors.weeks[i].limit) ? <span className="ct-field__error" role="alert">{errors.weeks[i].limit}</span> : null}
                </label>
              </div>
            ))}

            <div className="ct-week">
              <h3 className="ct-week__title">Week 4 · Final</h3>
              <label className="ct-field">
                <span className="ct-field__label">Final task</span>
                <textarea
                  value={form.finalTask}
                  onChange={(ev) => set("finalTask", ev.target.value)}
                  placeholder="Write the final challenge in your own words."
                  maxLength={CONTEST_TASK_MAX_LENGTH}
                  rows={3}
                  disabled={!finalTaskEditable}
                />
                <span className="ct-field__hint">Shown at the bottom of the leaderboard page.</span>
              </label>
              <label className="ct-switch">
                <input
                  type="checkbox"
                  checked={form.followersExcluded}
                  onChange={(ev) => set("followersExcluded", ev.target.checked)}
                  disabled={!can(e?.followersExcludedWeek4)}
                />
                <span>
                  <strong>Followers-excluded counting</strong>{" "}
                  <span className="ct-field__hint ct-switch__hint">
                    Count only engagement from accounts that do not follow the finalist, for this week only. Views are
                    not counted in the final, so week 4 has no watch limit.
                  </span>
                </span>
              </label>
              <div className="ct-date-row">
                <label className="ct-field">
                  <span className="ct-field__label">Exposure tolerance (%)</span>
                  <input
                    inputMode="numeric"
                    value={form.tolerance}
                    onChange={(ev) => set("tolerance", ev.target.value)}
                    disabled={!can(e?.exposureTolerancePercent)}
                  />
                  {show(errors.tolerance) ? <span className="ct-field__error" role="alert">{errors.tolerance}</span> : null}
                </label>
                <label className="ct-field">
                  <span className="ct-field__label">Views per viewer per day</span>
                  <input
                    inputMode="numeric"
                    value={form.cap}
                    onChange={(ev) => set("cap", ev.target.value)}
                    disabled={!can(e?.exposureViewerDailyCap)}
                  />
                  {show(errors.cap) ? <span className="ct-field__error" role="alert">{errors.cap}</span> : null}
                </label>
              </div>
            </div>

            <div className="ct-form-actions">
              <button
                type="button"
                className="ct-btn ct-btn--primary"
                onClick={() => void submit()}
                disabled={saving || (!editing && !valid)}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create contest"}
              </button>
              <Link className="ct-btn ct-btn--outline" to="/contest">
                Cancel
              </Link>
              {!editing && !valid ? (
                <span className="ct-action-hint">
                  Create is blocked until these are set: {missing.join(", ")}.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
