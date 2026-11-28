import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setAuthToken } from "../../api/client.js";
import { MAX_FEEDBACK_LENGTH, sendFeedback } from "../../api/services/feedback.js";
import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  "Send feedback": the service (POST /feedback) and the dialog opened from the profile menu.
*/

let api;
let sent; // the bodies POSTed to /feedback

function installBackend(reply = (body) => [201, ok({ id: "f-1", ...body, created_at: "2026-11-24T10:00:00Z" }, "Feedback saved")]) {
  sent = [];
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onPost("/feedback").reply((config) => {
    const body = JSON.parse(config.data);
    sent.push(body);
    return reply(body);
  });
  // Anything else the page loads around the header.
  api.onAny().reply(200, ok({}));
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
});
afterEach(() => {
  api.restore();
  localStorage.clear();
});

describe("feedback service", () => {
  beforeEach(() => setAuthToken("test-token"));
  afterEach(() => setAuthToken(null));

  it("posts the tag and the trimmed description, and the rating only with the tag feedback", async () => {
    installBackend();
    await sendFeedback({ tag: "feedback", description: "  Great app  ", rating: 4 });
    await sendFeedback({ tag: "bug", description: "Upload fails", rating: 3 });
    expect(sent).toEqual([
      { tag: "feedback", description: "Great app", rating: 4 },
      { tag: "bug", description: "Upload fails" },
    ]);
  });

  it("puts the backend's 422 field errors on the error", async () => {
    installBackend(() => [422, { status: false, message: "Description is required", data: { errors: { description: "Description is required" } } }]);
    await expect(sendFeedback({ tag: "idea", description: "x" })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { description: "Description is required" },
    });
  });
});

describe("Send feedback dialog", () => {
  async function openDialog() {
    const user = userEvent.setup();
    renderApp("/profile");
    await user.click(await screen.findByRole("button", { name: "Open profile menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Send feedback" }));
    return { user, dialog: screen.getByRole("dialog", { name: "Send feedback" }) };
  }
  const send = (dialog) => within(dialog).getByRole("button", { name: "Send feedback" });

  it("opens from the profile menu, which closes", async () => {
    installBackend();
    const { dialog } = await openDialog();
    expect(screen.queryByRole("menu", { name: "Profile menu" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("radio").map((radio) => radio.closest("label").querySelector(".feedback__tag-name").textContent)).toEqual([
      "Bug",
      "Idea",
      "Feedback",
      "Other",
    ]);
    // Nothing chosen or written yet: Send waits.
    expect(send(dialog)).toBeDisabled();
  });

  it("sends a bug report and thanks the student", async () => {
    installBackend();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Bug/ }));
    expect(send(dialog)).toBeDisabled(); // still no description
    await user.type(within(dialog).getByLabelText("Your feedback"), "  The PDF viewer goes blank on page 3  ");
    expect(within(dialog).getByText(`39 of ${MAX_FEEDBACK_LENGTH} characters`)).toBeInTheDocument();
    // No rating for a bug.
    expect(within(dialog).queryByRole("group", { name: /How would you rate Lectra/ })).not.toBeInTheDocument();
    await user.click(send(dialog));

    expect(await screen.findByText("Thanks for your feedback")).toBeInTheDocument();
    expect(sent).toEqual([{ tag: "bug", description: "The PDF viewer goes blank on page 3" }]);
    const done = screen.getByRole("button", { name: "Done" });
    expect(done).toHaveFocus();
    await user.click(done);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The focus goes back to the avatar (the menu row is gone).
    expect(screen.getByRole("button", { name: "Open profile menu" })).toHaveFocus();
  });

  it("offers a rating only for the type Feedback, and clears it for another type", async () => {
    installBackend();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Feedback/ }));
    const rating = within(dialog).getByRole("group", { name: /How would you rate Lectra/ });
    await user.click(within(rating).getByRole("radio", { name: "4 stars" }));
    expect(within(rating).getByRole("radio", { name: "4 stars" })).toBeChecked();

    // Another type: the rating goes away and is not sent.
    await user.click(within(dialog).getByRole("radio", { name: /Idea/ }));
    expect(within(dialog).queryByRole("group", { name: /How would you rate Lectra/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: /Feedback/ }));
    expect(within(within(dialog).getByRole("group", { name: /How would you rate Lectra/ })).getByRole("radio", { name: "4 stars" })).not.toBeChecked();

    await user.click(within(dialog).getByRole("radio", { name: "5 stars" }));
    await user.type(within(dialog).getByLabelText("Your feedback"), "Really helpful for revision");
    await user.click(send(dialog));
    await screen.findByText("Thanks for your feedback");
    expect(sent).toEqual([{ tag: "feedback", description: "Really helpful for revision", rating: 5 }]);
  });

  it("sends a Feedback without a rating (it is optional)", async () => {
    installBackend();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Feedback/ }));
    await user.click(within(dialog).getByRole("radio", { name: "2 stars" }));
    await user.click(within(dialog).getByRole("button", { name: "Clear rating" }));
    await user.type(within(dialog).getByLabelText("Your feedback"), "Fine overall");
    await user.click(send(dialog));
    await screen.findByText("Thanks for your feedback");
    expect(sent).toEqual([{ tag: "feedback", description: "Fine overall" }]);
  });

  it("doesn't send only spaces, and limits the description to 5,000 characters", async () => {
    installBackend();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Other/ }));
    const field = within(dialog).getByLabelText("Your feedback");
    await user.type(field, "    ");
    expect(send(dialog)).toBeDisabled();
    expect(field).toHaveAttribute("maxLength", String(MAX_FEEDBACK_LENGTH));
  });

  it("sends once even when Send is clicked twice", async () => {
    let answer;
    installBackend((body) => new Promise((resolve) => (answer = () => resolve([201, ok({ id: "f-1", ...body })]))));
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Idea/ }));
    await user.type(within(dialog).getByLabelText("Your feedback"), "Dark mode for the notebook");
    await user.click(send(dialog));
    expect(within(dialog).getByRole("button", { name: "Sending…" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Sending…" }));
    await waitFor(() => expect(answer).toBeTypeOf("function"));
    answer();
    await screen.findByText("Thanks for your feedback");
    expect(sent).toHaveLength(1);
  });

  it("shows the backend's field errors at the fields", async () => {
    installBackend(() => [422, { status: false, message: "Rating must be between 1 and 5", data: { errors: { rating: "Rating must be between 1 and 5" } } }]);
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Feedback/ }));
    await user.click(within(dialog).getByRole("radio", { name: "3 stars" }));
    await user.type(within(dialog).getByLabelText("Your feedback"), "Hmm");
    await user.click(send(dialog));
    const group = within(dialog).getByRole("group", { name: /How would you rate Lectra/ });
    expect(await within(group).findByRole("alert")).toHaveTextContent("Rating must be between 1 and 5");
    expect(screen.queryByText("Thanks for your feedback")).not.toBeInTheDocument();
  });

  it("shows a failed send in the dialog and keeps the text", async () => {
    installBackend(() => [500, { status: false, message: "Something went wrong on our side.", data: null }]);
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: /Bug/ }));
    await user.type(within(dialog).getByLabelText("Your feedback"), "Exam does not load");
    await user.click(send(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong on our side.");
    expect(within(dialog).getByLabelText("Your feedback")).toHaveValue("Exam does not load");
    expect(send(dialog)).toBeEnabled(); // can try again
  });

  it("closes with Cancel without sending", async () => {
    installBackend();
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sent).toEqual([]);
  });
});
