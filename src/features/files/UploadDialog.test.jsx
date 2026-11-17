import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import UploadDialog from "./UploadDialog.jsx";

const pdf = (name, { size = 10, lastModified = 1000 } = {}) =>
  new File(["x".repeat(size)], name, { type: "application/pdf", lastModified });

function setup() {
  const user = userEvent.setup();
  const onUpload = vi.fn();
  render(<UploadDialog onCancel={() => {}} onUpload={onUpload} />);
  const input = screen.getByTestId("upload-input");
  const listed = () =>
    within(screen.getByRole("list", { name: "Selected files" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
  return { user, onUpload, input, listed };
}

describe("UploadDialog duplicates", () => {
  it("skips a file picked a second time and says so", async () => {
    const { user, onUpload, input, listed } = setup();
    await user.upload(input, pdf("Lecture 1.pdf"));
    await user.upload(input, pdf("Lecture 1.pdf"));
    expect(listed()).toEqual(["Lecture 1.pdf"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Already in the list, skipped: Lecture 1.pdf");

    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0][0]).toHaveLength(1);
  });

  it("skips duplicates within one pick", async () => {
    const { user, input, listed } = setup();
    await user.upload(input, [pdf("a.pdf"), pdf("a.pdf"), pdf("b.pdf")]);
    expect(listed()).toEqual(["a.pdf", "b.pdf"]);
    expect(screen.getByRole("alert")).toHaveTextContent("Already in the list, skipped: a.pdf");
  });

  it("keeps files with the same name but a different size or date", async () => {
    const { user, input, listed } = setup();
    await user.upload(input, pdf("a.pdf"));
    await user.upload(input, [pdf("a.pdf", { size: 20 }), pdf("a.pdf", { lastModified: 2000 })]);
    expect(listed()).toEqual(["a.pdf", "a.pdf", "a.pdf"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can add a file again after removing it", async () => {
    const { user, input, listed } = setup();
    await user.upload(input, pdf("a.pdf"));
    await user.click(screen.getByRole("button", { name: "Remove a.pdf" }));
    await user.upload(input, pdf("a.pdf"));
    expect(listed()).toEqual(["a.pdf"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
