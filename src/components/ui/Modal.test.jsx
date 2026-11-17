import { StrictMode, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Modal from "./Modal.jsx";
import Menu from "./Menu.jsx";
import EditLectureDialog from "../../features/lectures/EditLectureDialog.jsx";
import { ChatNameDialog, ProjectNameDialog } from "../../features/workspace/components/ProjectDialogs.jsx";

function renderApp(ui, { strict = false } = {}) {
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

/* A page with a button before the dialog's opener, the way the app has a header. */
function Page({ dialog, viaMenu = false }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button">Header button</button>
      {viaMenu ? (
        <Menu label="Chat actions" items={[{ label: "Rename", onSelect: () => setOpen(true) }]} />
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Open dialog
        </button>
      )}
      {open && dialog(close)}
    </>
  );
}

describe("Modal focus", () => {
  it("keeps the autoFocus field focused and returns the focus to the opener on Escape", async () => {
    const user = userEvent.setup();
    renderApp(
      <Page dialog={(close) => <ChatNameDialog session={{ title: "Linear maps" }} onSave={close} onCancel={close} />} />,
      { strict: true }
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByLabelText("Chat title")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
  });

  it("returns the focus to the Menu button when the dialog was opened from a menu item", async () => {
    const user = userEvent.setup();
    renderApp(
      <Page viaMenu dialog={(close) => <ProjectNameDialog project={{ name: "Algebra" }} onSave={close} onCancel={close} />} />
    );

    screen.getByRole("button", { name: "Chat actions" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Rename project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Chat actions" })).toHaveFocus();
  });

  it("focuses the toggle of the region the opener was in when the opener is gone (phone menu)", async () => {
    const user = userEvent.setup();
    function PhonePage() {
      const [menuOpen, setMenuOpen] = useState(true);
      const [dialog, setDialog] = useState(false);
      const close = () => setDialog(false);
      return (
        <>
          <button type="button" aria-controls="chat-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            Menu
          </button>
          {menuOpen && (
            <nav id="chat-menu">
              <Menu
                label="Chat actions"
                items={[
                  {
                    label: "Rename",
                    onSelect: () => {
                      setMenuOpen(false);
                      setDialog(true);
                    },
                  },
                ]}
              />
            </nav>
          )}
          {dialog && <ChatNameDialog session={{ title: "Linear maps" }} onSave={close} onCancel={close} />}
        </>
      );
    }
    renderApp(<PhonePage />);

    screen.getByRole("button", { name: "Chat actions" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Chat title")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Chat actions" })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });

  it("keeps Escape to itself, so a window listener (the phone menu) stays closed", async () => {
    const user = userEvent.setup();
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      renderApp(
        <Page dialog={(close) => <ChatNameDialog session={{ title: "Linear maps" }} onSave={close} onCancel={close} />} />
      );
      await user.click(screen.getByRole("button", { name: "Open dialog" }));
      onWindowKey.mockClear();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("focuses the dialog itself when no child takes the focus", async () => {
    const user = userEvent.setup();
    renderApp(
      <Page
        dialog={(close) => (
          <Modal title="Plain" onClose={close}>
            <p>Text</p>
          </Modal>
        )}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog", { name: "Plain" })).toHaveFocus();
  });
});

describe("Modal focus trap", () => {
  it("cycles Tab and Shift+Tab inside the dialog", async () => {
    const user = userEvent.setup();
    renderApp(
      <Page
        dialog={(close) => (
          <EditLectureDialog lecture={{ title: "Week 1", original_filename: "week1.pdf" }} onSave={close} onCancel={close} />
        )}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const dialog = screen.getByRole("dialog", { name: "Rename lecture" });
    const title = screen.getByLabelText("Title");
    expect(title).toHaveFocus();

    // Order: Close, Title, Cancel, Rename. Five Tabs from Title stay inside and wrap around.
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement);
    }
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Rename" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
  });

  it("keeps the focus on the dialog when it has nothing focusable", async () => {
    const user = userEvent.setup();
    renderApp(
      <Page
        dialog={(close) => (
          <Modal title="Plain" onClose={close}>
            <p>Text</p>
          </Modal>
        )}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });
});
