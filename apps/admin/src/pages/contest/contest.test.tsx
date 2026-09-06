import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ContestTasksPage from "./ContestTasksPage";
import {
  ContestCreateTaskPage,
  ContestDeleteTaskPage,
  ContestScheduleTaskPage,
} from "./ContestTaskFormPages";

afterEach(cleanup);

describe("Contest stub screens", () => {
  it("Tasks: discloses the task-model gap, tabs switch, links to Create Task", () => {
    render(<MemoryRouter><ContestTasksPage /></MemoryRouter>);
    expect(screen.getByRole("note").textContent).toMatch(/no backend entity/i);
    expect(screen.getByRole("link", { name: "Create Task" }).getAttribute("href")).toBe(
      "/contest/tasks/new",
    );
    fireEvent.click(screen.getByRole("button", { name: "Empty state" }));
    expect(screen.getByText(/no contest tasks yet/i)).not.toBeNull();
  });

  it("Create Task: the 4 task fields + Create, all disabled", () => {
    render(<MemoryRouter><ContestCreateTaskPage /></MemoryRouter>);
    const fields = [...screen.queryAllByRole("textbox")];
    expect(fields.length).toBeGreaterThanOrEqual(4);
    for (const f of fields) expect(f.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Create Task" }).hasAttribute("disabled")).toBe(true);
  });

  it("Schedule / Delete: reproduced, actions disabled", () => {
    render(<MemoryRouter><ContestScheduleTaskPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Schedule Task" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    render(<MemoryRouter><ContestDeleteTaskPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Delete Task" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/contest");
  });
});
