import { describe, expect, it } from "vitest";

import { createAccountSchema } from "./validationSchemas.js";

describe("strong password validation", () => {
  const valuesFor = (password) => ({
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    password,
    confirmPassword: password,
  });

  it.each([
    ["Ab1!xyz", "Password must be between 8 and 14 characters."],
    ["lowercase1!", "Password must include an uppercase letter."],
    ["UPPERCASE1!", "Password must include a lowercase letter."],
    ["Uppercase!", "Password must include a number."],
    ["Uppercase1", "Password must include a special character."],
  ])("rejects %s without the required character type", async (password, message) => {
    await expect(createAccountSchema.validate(valuesFor(password))).rejects.toMatchObject({
      errors: expect.arrayContaining([message]),
    });
  });

  it("accepts a password containing all required character types", async () => {
    await expect(createAccountSchema.validate(valuesFor("StrongPass1!"))).resolves.toBeTruthy();
  });

  it("rejects passwords longer than 14 characters", async () => {
    await expect(createAccountSchema.validate(valuesFor("VeryStrongPass123!"))).rejects.toMatchObject({
      errors: expect.arrayContaining(["Password must be between 8 and 14 characters."]),
    });
  });
});
