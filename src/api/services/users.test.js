import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAuthToken, setAuthToken } from "../client.js";
import { getCurrentUser, updateCurrentUser, changeCurrentPassword } from "./users.js";
import { mockApi, ok, TEST_USER } from "../../test/helpers.jsx";

describe("users service", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    setAuthToken("test-token");
  });

  afterEach(() => {
    api.restore();
    setAuthToken(null);
  });

  it("fetches the signed-in user from GET /users/me", async () => {
    api.onGet("/users/me").reply((config) =>
      config.headers.Authorization ? [200, ok(TEST_USER)] : [401, { detail: "Not authenticated" }]
    );

    await expect(getCurrentUser()).resolves.toEqual(TEST_USER);
  });

  it("patches the profile using the backend full_name field", async () => {
    const updatedUser = { ...TEST_USER, full_name: "Grace Hopper", email: "grace@example.com" };
    api.onPatch("/users/me").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ full_name: "Grace Hopper", email: "grace@example.com" });
      return [200, ok(updatedUser, "Profile updated")];
    });

    await expect(updateCurrentUser({ fullName: "Grace Hopper", email: "grace@example.com" })).resolves.toEqual(
      updatedUser
    );
  });

  it("changes the password with the backend field names", async () => {
    api.onPut("/users/me/password").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({
        current_password: "Current1!",
        new_password: "NewPassword1!",
      });
      return [200, ok(null, "Password changed")];
    });

    await expect(
      changeCurrentPassword({ currentPassword: "Current1!", newPassword: "NewPassword1!" })
    ).resolves.toMatchObject({ message: "Password changed" });
    expect(getAuthToken()).toBe("test-token");
  });
});
