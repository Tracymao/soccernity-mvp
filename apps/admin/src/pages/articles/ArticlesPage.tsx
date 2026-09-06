// Articles list — Figma node 123:56.
//
// STUB: `POST /admin/articles` / `PATCH /admin/articles/:id` are not
// built, and Build Plan Section 4.8 defines no articles-list endpoint at
// all. Layout reproduced (the table + "Create Article"); nothing works.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubTable } from "../../components/stub/AdminStub";

const ROWS: string[][] = [
  ["08/08/2022", "Zaha double helps Crystal Palace ease past Villa", "Premier League"],
  ["08/08/2022", "Late Barça winner sinks Sevilla", "La Liga"],
  ["08/08/2022", "Rangers edge Enyimba in Aba", "NPFL"],
  ["08/08/2022", "Bayern run riot in Munich", "Bundesliga"],
];

export default function ArticlesPage() {
  return (
    <AdminStubScreen
      title="Articles"
      banner={
        <>
          `POST /admin/articles` and `PATCH /admin/articles/:id` are not built, and Build Plan
          Section 4.8 defines no articles-list endpoint. The table is sample data.
        </>
      }
    >
      <div className="admin-stub__actions">
        <Link to="/articles/new" className="admin-stub__linkbtn">
          Create Article
        </Link>
      </div>
      <StubTable columns={["Date", "Cover", "Title", "Category"]} rows={ROWS.map((r) => [r[0], "—", r[1], r[2]])} />
    </AdminStubScreen>
  );
}
