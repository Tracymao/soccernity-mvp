// Contest task screens — Figma nodes 5403:6640 (Create), 5403:6753
// (Schedule), 5403:6866 (Edit), 5403:6979 (Search), 5403:7092 (Delete),
// 5405:8390 (Task Scheduled — Success).
//
// STUB — see contestBackendNote.tsx. All forms are reproduced and
// disabled.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { StubButton, StubField, StubTable } from "../../components/stub/AdminStub";
import { ContestBackendNote } from "./contestBackendNote";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="admin-stub__back">
        <Link to="/contest">← Contest</Link>
      </div>
      <AdminPageHeader title={title} hideSearch />
      <ContestBackendNote />
      <div className="admin-stub__body">{children}</div>
    </>
  );
}

function TaskFields({ prefill }: { prefill?: boolean }) {
  return (
    <>
      <StubField label="Task name" value={prefill ? "Best goal celebration" : ""} />
      <StubField label="Hashtag" value={prefill ? "#bestcelebration" : ""} />
      <StubField label="Description" kind="textarea" value={prefill ? "Submit your best celebration." : ""} />
      <StubField label="Target entry count" value={prefill ? "100" : ""} />
    </>
  );
}

export function ContestCreateTaskPage() {
  return (
    <Shell title="Create Task">
      <TaskFields />
      <div className="admin-stub__actions">
        <StubButton>Create Task</StubButton>
      </div>
    </Shell>
  );
}

export function ContestEditTaskPage() {
  return (
    <Shell title="Edit Task">
      <TaskFields prefill />
      <div className="admin-stub__actions">
        <StubButton>Save Task</StubButton>
      </div>
    </Shell>
  );
}

export function ContestScheduleTaskPage() {
  return (
    <Shell title="Schedule Task">
      <p className="admin-stub__note">
        The Figma screen reuses the shared calendar component (`2365:2033`, `calendar 2`) to pick a
        publish date. Rendered here as disabled date fields.
      </p>
      <StubField label="Publish date" value="03 Apr 2026" />
      <StubField label="Close date" value="09 Apr 2026" />
      <div className="admin-stub__actions">
        <StubButton>Schedule Task</StubButton>
        <Link to="/contest/tasks/scheduled" className="admin-stub__note">
          Success screen (also a stub) →
        </Link>
      </div>
    </Shell>
  );
}

export function ContestSearchTaskPage() {
  return (
    <Shell title="Search Task">
      <StubField label="Search tasks" value="" />
      <StubTable
        columns={["Date", "Name", "Hashtag", "Count"]}
        rows={[["27/03/23", "Best goal celebration", "#bestcelebration", "69"]]}
      />
    </Shell>
  );
}

export function ContestDeleteTaskPage() {
  return (
    <Shell title="Delete Task">
      <p className="admin-stub__note">
        “Best goal celebration” <em>(sample)</em>. Entries submitted to a deleted task would be
        detached.
      </p>
      <div className="admin-stub__actions">
        <StubButton>Delete Task</StubButton>
        <Link to="/contest" className="admin-stub__linkbtn">
          Cancel
        </Link>
      </div>
    </Shell>
  );
}

export function ContestTaskScheduledPage() {
  return (
    <Shell title="Task scheduled">
      <p className="admin-stub__note">
        “Weak-foot worldie” would be scheduled to publish on 03 Apr 2026 <em>(sample)</em>.
      </p>
      <div className="admin-stub__actions">
        <Link to="/contest" className="admin-stub__linkbtn">
          Back to Contest
        </Link>
      </div>
    </Shell>
  );
}
