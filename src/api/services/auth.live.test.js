import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { apiClient, getAuthToken, setAuthToken } from "../client.js";
import { getCurrentUser, login, register } from "./auth.js";

/*
  LIVE test against the real FastAPI backend — skipped unless API_LIVE_URL is set.
    npm run test:live            (uses http://127.0.0.1:8000/api)
  Each run registers one new user: lectra-live-<timestamp>@example.com
*/
const LIVE_URL = process.env.API_LIVE_URL;

describe.skipIf(!LIVE_URL)("auth API (live backend)", () => {
  const saved = {};
  const email = `lectra-live-${Date.now()}@example.com`;
  const password = "live-test-123";

  beforeAll(() => {
    saved.baseURL = apiClient.defaults.baseURL;
    saved.adapter = apiClient.defaults.adapter;
    apiClient.defaults.baseURL = LIVE_URL;
    apiClient.defaults.adapter = "http"; // Node HTTP instead of jsdom XHR (which would enforce CORS)
  });
  afterAll(() => {
    apiClient.defaults.baseURL = saved.baseURL;
    apiClient.defaults.adapter = saved.adapter;
  });

  it("registers a new user", async () => {
    const user = await register({ email, password, fullName: "Live Test" });
    expect(user).toMatchObject({ email, full_name: "Live Test" });
    expect(user.id).toBeTruthy();
  });

  it("rejects a second registration with the same email", async () => {
    await expect(register({ email, password, fullName: "Live Test" })).rejects.toMatchObject({
      status: 409,
      message: "A user with this email already exists",
    });
  });

  it("rejects a wrong password", async () => {
    await expect(login({ email, password: "wrong" })).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    });
    expect(getAuthToken()).toBeNull();
  });

  it("signs in and loads the current user with the token", async () => {
    const { token } = await login({ email, password });
    expect(token.split(".")).toHaveLength(3);
    expect(getAuthToken()).toBe(token);

    const user = await getCurrentUser();
    expect(user).toMatchObject({ email, full_name: "Live Test" });
  });

  it("clears a token the backend rejects", async () => {
    setAuthToken("invalid.token.value");
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 });
    expect(getAuthToken()).toBeNull();
  });
});
