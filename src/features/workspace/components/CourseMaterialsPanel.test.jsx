import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CourseMaterialsPanel from "./CourseMaterialsPanel.jsx";

const material = (id, name, type) => ({ id, name, type, size: 2048, url: `blob:${id}`, persisted: true });

function renderPanel(props) {
  const handlers = { onToggleCollapsed: vi.fn(), onSelect: vi.fn(), onRemove: vi.fn(), onUploadClick: vi.fn(), onDismissError: vi.fn() };
  render(
    <CourseMaterialsPanel status="ready" persistent error={null} selectedId={null} collapsed={false} materials={[]} {...handlers} {...props} />
  );
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

  it("groups uploads by type and only shows groups that have files", () => {
    renderPanel({ materials: [material("a", "Week1.pdf", "pdf"), material("b", "lab.ipynb", "notebook")] });
    expect(screen.getByRole("heading", { name: "PDFs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notebook" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Slides" })).not.toBeInTheDocument();
    expect(screen.queryByText("No course materials yet")).not.toBeInTheDocument();
  });

  it("filters by name and reports no matches", async () => {
    renderPanel({ materials: [material("a", "Week1.pdf", "pdf"), material("b", "lab.ipynb", "notebook")] });
    const filter = screen.getByRole("searchbox");
    await userEvent.type(filter, "lab");
    expect(screen.queryByText("Week1.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("lab.ipynb")).toBeInTheDocument();

    await userEvent.clear(filter);
    await userEvent.type(filter, "zzz");
    expect(screen.getByText("No materials match “zzz”.")).toBeInTheDocument();
  });

  it("opens, downloads and removes a file", async () => {
    const pdf = material("a", "Week1.pdf", "pdf");
    const { onSelect, onRemove } = renderPanel({ materials: [pdf] });
    const item = screen.getByRole("listitem");

    await userEvent.click(within(item).getByRole("button", { name: /^Week1\.pdf/ }));
    expect(onSelect).toHaveBeenCalledWith(pdf);

    const download = within(item).getByRole("link", { name: "Download Week1.pdf" });
    expect(download).toHaveAttribute("href", "blob:a");
    expect(download).toHaveAttribute("download", "Week1.pdf");

    await userEvent.click(within(item).getByRole("button", { name: "Remove Week1.pdf" }));
    expect(onRemove).toHaveBeenCalledWith(pdf);
  });

  it("says when files are only kept for this tab", () => {
    renderPanel({ persistent: false, materials: [{ ...material("a", "x.md", "notes"), persisted: false }] });
    expect(screen.getByText(/kept until you close this tab/)).toBeInTheDocument();
    expect(screen.getByText(/this tab only/)).toBeInTheDocument();
  });
});
