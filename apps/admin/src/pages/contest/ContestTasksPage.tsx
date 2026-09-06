// Contest Tasks — Figma nodes 2363:2244 (Contest Task tab), 2363:3446
// (Scheduled Contest Task tab), 5405:8277 (Empty State).
//
// STUB — see contestBackendNote.tsx for the full backend situation.
import { useState } from "react";
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { StubTable } from "../../components/stub/AdminStub";
import { ContestBackendNote } from "./contestBackendNote";

const OPEN_ROWS: string[][] = [
  ["27/03/23", "Best goal celebration", "#bestcelebration", "69"],
  ["27/03/23", "Sunday league screamer", "#screamer", "42"],
];
const SCHEDULED_ROWS: string[][] = [["03/04/23", "Weak-foot worldie", "#weakfoot", "0"]];

export default function ContestTasksPage() {
  const [tab, setTab] = useState<"open" | "scheduled" | "empty">("open");
  const rows = tab === "open" ? OPEN_ROWS : tab === "scheduled" ? SCHEDULED_ROWS : [];

  return (
    <>
      <AdminPageHeader title="Contest" hideSearch />
      <ContestBackendNote />
      <div className="admin-stub__body">
        <div className="admin-stub__tabs">
          <button
            className={"admin-stub__tab" + (tab === "open" ? " admin-stub__tab--active" : "")}
            onClick={() => setTab("open")}
            type="button"
          >
            Contest Tasks
          </button>
          <button
            className={"admin-stub__tab" + (tab === "scheduled" ? " admin-stub__tab--active" : "")}
            onClick={() => setTab("scheduled")}
            type="button"
          >
            Scheduled
          </button>
          <button
            className={"admin-stub__tab" + (tab === "empty" ? " admin-stub__tab--active" : "")}
            onClick={() => setTab("empty")}
            type="button"
          >
            Empty state
          </button>
        </div>

        <div className="admin-stub__actions">
          <Link to="/contest/tasks/new" className="admin-stub__linkbtn">
            Create Task
          </Link>
          <Link to="/contest/tasks/search" className="admin-stub__note">
            Search tasks →
          </Link>
        </div>

        {rows.length > 0 ? (
          <StubTable columns={["Date", "Name", "Hashtag", "Count"]} rows={rows} />
        ) : (
          <p className="admin-stub__note">No contest tasks yet. (Empty-state view — Figma 5405:8277.)</p>
        )}
      </div>
    </>
  );
}
