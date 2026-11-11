import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CourseMaterialsPanel from "./CourseMaterialsPanel.jsx";

const material = (id, name, type, extra = {}) => ({ id, name, type, meta: `${type} meta`, status: "completed", error: null, ...extra });

function renderPanel(props) {
  const handlers = {
    onToggleCollapsed: vi.fn(), onSelect: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onRetry: vi.fn(),
    onDismissUpload: vi.fn(), onReload: vi.fn(), onUploadClick: vi.fn(),
  };
  render(<CourseMaterialsPanel selectedId={null} collapsed={false} materials={[]} {...handlers} {...props} />);
  return handlers;
}

describe("CourseMaterialsPanel", () => {
  it("shows an empty state and no filter when nothing is uploaded", async () => {
    const { onUploadClick } = renderPanel();
    expect(screen.getByText("No course materials yet")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Upload materials" }));
    expect(onUploadClick).toHaveBeenCalled();
  });

  it("shows loading and a retry when the list cannot be loaded", async () => {
    renderPanel({ loading: true });
    expect(screen.getByText("Loading your materials…")).toBeInTheDocument();
  });

  it("offers to try again after a load error", async () => {
    const { onReload } = renderPanel({ error: new Error("Can't reach the server.") });
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onReload).toHaveBeenCalled();
  });

  it("groups lectures by type and only shows groups that have files", () => {
    renderPanel({ materials: [material("a", "Week 1", "pdf"), material("b", "Lab", "notebook"), material("c", "Summary", "notes")] });
    expect(screen.getByRole("heading", { name: "PDFs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notebook" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lecture notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Slides" })).not.toBeInTheDocument();
    expect(screen.queryByText("No course materials yet")).not.toBeInTheDocument();
  });

  it("filters by name and reports no matches", async () => {
    renderPanel({ materials: [material("a", "Week 1", "pdf"), material("b", "Lab", "notebook")] });
    const filter = screen.getByRole("searchbox");
    await userEvent.type(filter, "lab");
    expect(screen.queryByText("Week 1")).not.toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();

    await userEvent.clear(filter);
    await userEvent.type(filter, "zzz");
    expect(screen.getByText("No materials match “zzz”.")).toBeInTheDocument();
  });

  it("opens, edits and deletes a lecture", async () => {
    const pdf = material("a", "Week 1", "pdf");
    const { onSelect, onEdit, onDelete } = renderPanel({ materials: [pdf] });
    const item = screen.getByRole("listitem");

    await userEvent.click(within(item).getByRole("button", { name: /^Week 1/ }));
    expect(onSelect).toHaveBeenCalledWith(pdf);
    await userEvent.click(within(item).getByRole("button", { name: "Edit Week 1" }));
    expect(onEdit).toHaveBeenCalledWith(pdf);
    await userEvent.click(within(item).getByRole("button", { name: "Delete Week 1" }));
    expect(onDelete).toHaveBeenCalledWith(pdf);
  });

  it("shows processing status, failures with a retry, and upload progress", async () => {
    const failed = material("b", "Scan", "pdf", { status: "failed", error: "No text could be extracted." });
    const { onRetry, onDismissUpload } = renderPanel({
      materials: [material("a", "Week 1", "pdf", { status: "processing" }), failed],
      uploads: [{ id: "u1", name: "big.pdf", progress: 40, error: null }, { id: "u2", name: "bad.pdf", progress: 0, error: "Rejected" }],
    });
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("No text could be extracted.")).toBeInTheDocument();
    expect(screen.getByLabelText("Uploading big.pdf: 40%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry processing Scan" }));
    expect(onRetry).toHaveBeenCalledWith(failed);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss bad.pdf" }));
    expect(onDismissUpload).toHaveBeenCalledWith("u2");
  });
});
