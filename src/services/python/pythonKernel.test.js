import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KernelError, PythonKernel } from "./pythonKernel.js";

/* Stands in for pyodideWorker.js: records messages and lets the test reply. */
class FakeWorker {
  constructor() {
    this.sent = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }
  postMessage(message) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message) {
    this.onmessage({ data: message });
  }
  lastExecute() {
    return this.sent.filter((message) => message.type === "execute").at(-1);
  }
}
FakeWorker.instances = [];

function makeKernel(options) {
  return new PythonKernel({ indexURL: "https://cdn.test/", createWorker: () => new FakeWorker(), ...options });
}

async function readyKernel(options) {
  const kernel = makeKernel(options);
  const started = kernel.start();
  FakeWorker.instances.at(-1).reply({ type: "ready", pythonVersion: "3.14.2", pyodideVersion: "314.0.7" });
  await started;
  return kernel;
}

beforeEach(() => {
  FakeWorker.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PythonKernel", () => {
  it("starts lazily and reports idle with the Python version", async () => {
    const kernel = makeKernel();
    expect(kernel.getSnapshot().status).toBe("stopped");
    expect(FakeWorker.instances).toHaveLength(0);

    const started = kernel.start();
    expect(kernel.start()).toBe(started); // one worker, however often start() is called
    expect(kernel.getSnapshot().status).toBe("starting");
    expect(FakeWorker.instances[0].sent[0]).toMatchObject({ type: "init", indexURL: "https://cdn.test/" });

    FakeWorker.instances[0].reply({ type: "ready", pythonVersion: "3.14.2", pyodideVersion: "314.0.7" });
    await started;
    expect(kernel.getSnapshot()).toMatchObject({ status: "idle", pythonVersion: "3.14.2" });
  });

  it("streams outputs and numbers executions 1, 2, … in one worker", async () => {
    const kernel = await readyKernel();
    const worker = FakeWorker.instances[0];
    const outputs = [];

    const first = kernel.execute("x = 1", { onOutput: (output) => outputs.push(output) });
    await vi.waitFor(() => expect(worker.lastExecute()).toBeTruthy());
    expect(kernel.getSnapshot().status).toBe("busy");
    const { id } = worker.lastExecute();
    worker.reply({ type: "output", id, output: { output_type: "stream", name: "stdout", text: "hi\n" } });
    worker.reply({ type: "result", id, status: "ok" });
    await expect(first).resolves.toEqual({ status: "ok", executionCount: 1 });
    expect(outputs).toEqual([{ output_type: "stream", name: "stdout", text: "hi\n" }]);

    const second = kernel.execute("x");
    await vi.waitFor(() => expect(worker.lastExecute().id).not.toBe(id));
    expect(worker.lastExecute().executionCount).toBe(2);
    worker.reply({ type: "result", id: worker.lastExecute().id, status: "ok" });
    await expect(second).resolves.toMatchObject({ executionCount: 2 });
    expect(FakeWorker.instances).toHaveLength(1);
    expect(kernel.getSnapshot().status).toBe("idle");
  });

  it("passes Python errors on as error outputs", async () => {
    const kernel = await readyKernel();
    const worker = FakeWorker.instances[0];
    const outputs = [];
    const run = kernel.execute("boom", { onOutput: (output) => outputs.push(output) });
    await vi.waitFor(() => expect(worker.lastExecute()).toBeTruthy());
    const error = { ename: "NameError", evalue: "name 'boom' is not defined", traceback: ["NameError: …"] };
    worker.reply({ type: "result", id: worker.lastExecute().id, status: "error", error });

    await expect(run).resolves.toMatchObject({ status: "error" });
    expect(outputs).toEqual([{ output_type: "error", ...error }]);
  });

  it("restart() terminates the worker, rejects the running cell and starts a fresh kernel", async () => {
    const kernel = await readyKernel();
    const run = kernel.execute("while True: pass");
    await vi.waitFor(() => expect(FakeWorker.instances[0].lastExecute()).toBeTruthy());

    kernel.restart();
    await expect(run).rejects.toMatchObject({ name: "KernelError", code: "restarted" });
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(kernel.getSnapshot().status).toBe("starting");
  });

  it("interrupt() without cross-origin isolation stops the cell by restarting Python, and says so", async () => {
    const kernel = await readyKernel();
    const outputs = [];
    const run = kernel.execute("while True: pass", { onOutput: (output) => outputs.push(output) });
    await vi.waitFor(() => expect(FakeWorker.instances[0].lastExecute()).toBeTruthy());

    kernel.interrupt();
    await expect(run).resolves.toEqual({ status: "error", executionCount: 1 });
    expect(outputs[0]).toMatchObject({ output_type: "error", ename: "KeyboardInterrupt" });
    expect(outputs[0].evalue).toMatch(/variables were cleared/);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("stops a cell that runs longer than the time limit", async () => {
    vi.useFakeTimers();
    const kernel = await readyKernel({ executionTimeoutMs: 5000 });
    const worker = FakeWorker.instances[0];
    const outputs = [];
    const run = kernel.execute("while True: pass", { onOutput: (output) => outputs.push(output) });
    await vi.waitFor(() => expect(worker.lastExecute()).toBeTruthy());
    worker.reply({ type: "started", id: worker.lastExecute().id }); // packages loaded, timer starts now

    await vi.advanceTimersByTimeAsync(4999);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(run).resolves.toMatchObject({ status: "error" });
    expect(outputs[0]).toMatchObject({ ename: "TimeoutError" });
    expect(outputs[0].evalue).toMatch(/longer than 5 seconds/);
    expect(worker.terminated).toBe(true);
  });

  it("reports Python as unavailable when loading fails, and retries on the next start()", async () => {
    const kernel = makeKernel();
    const started = kernel.start();
    FakeWorker.instances[0].reply({ type: "init-error", message: "Failed to fetch" });

    await expect(started).rejects.toBeInstanceOf(KernelError);
    expect(kernel.getSnapshot()).toMatchObject({ status: "unavailable" });
    expect(kernel.getSnapshot().error).toMatch(/Failed to fetch/);

    // Running a cell retries loading Python; if that fails again the cell is not run.
    const run = kernel.execute("1");
    await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(2));
    FakeWorker.instances[1].reply({ type: "init-error", message: "Failed to fetch" });
    await expect(run).rejects.toMatchObject({ code: "unavailable" });
    expect(FakeWorker.instances[1].lastExecute()).toBeUndefined();

    const retried = kernel.start();
    FakeWorker.instances.at(-1).reply({ type: "ready", pythonVersion: "3.14.2", pyodideVersion: "314.0.7" });
    await expect(retried).resolves.toBeUndefined();
    expect(kernel.getSnapshot().status).toBe("idle");
  });

  it("does not hang when Python never finishes loading", async () => {
    vi.useFakeTimers();
    const kernel = makeKernel({ loadTimeoutMs: 1000 });
    const started = kernel.start();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(started).rejects.toMatchObject({ code: "unavailable" });
    expect(kernel.getSnapshot().error).toMatch(/did not finish loading/);
  });

  it("reports a crashed worker in the running cell and restarts", async () => {
    const kernel = await readyKernel();
    const outputs = [];
    const run = kernel.execute("x", { onOutput: (output) => outputs.push(output) });
    await vi.waitFor(() => expect(FakeWorker.instances[0].lastExecute()).toBeTruthy());

    FakeWorker.instances[0].onerror({ message: "out of memory", preventDefault() {} });
    await expect(run).resolves.toMatchObject({ status: "error" });
    expect(outputs[0]).toMatchObject({ ename: "KernelError" });
    expect(outputs[0].evalue).toMatch(/out of memory/);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("is unavailable, not stuck, when the browser cannot create a worker", async () => {
    const kernel = new PythonKernel({
      createWorker: () => {
        throw new Error("Worker is not defined");
      },
    });
    await expect(kernel.start()).rejects.toMatchObject({ code: "unavailable" });
    expect(kernel.getSnapshot().status).toBe("unavailable");
  });
});
