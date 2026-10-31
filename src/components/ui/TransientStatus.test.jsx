import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TransientStatus from "./TransientStatus.jsx";

describe("TransientStatus", () => {
  afterEach(() => vi.useRealTimers());

  it("hides its message after three seconds and calls onDismiss", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <TransientStatus onDismiss={onDismiss}>
        <p role="status">Saved successfully</p>
      </TransientStatus>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Saved successfully");

    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
