import { afterEach, describe, expect, it } from "vitest";

import { setCurrentLanguage } from "../../i18n/i18n.js";
import { createAccountSchema, passwordRequirements, profileSchema, signInSchema } from "./validationSchemas.js";

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

describe("translated validation messages", () => {
  afterEach(() => setCurrentLanguage("en"));

  it("shows the messages in German when German is selected", async () => {
    setCurrentLanguage("de");
    await expect(
      createAccountSchema.validate({ fullName: "", email: "x", password: "Ab1!xyz", confirmPassword: "nope" }, { abortEarly: false })
    ).rejects.toMatchObject({
      errors: expect.arrayContaining([
        "Bitte gib deinen vollständigen Namen ein.",
        "Bitte gib eine gültige E-Mail-Adresse ein.",
        "Passwort muss zwischen 8 und 14 Zeichen lang sein.",
        "Die Passwörter stimmen nicht überein.",
      ]),
    });
    await expect(
      profileSchema.validate({ fullName: "Ada", email: "ada@example.com", newPassword: "short" }, { abortEarly: false })
    ).rejects.toMatchObject({
      errors: expect.arrayContaining(["Neues Passwort muss zwischen 8 und 14 Zeichen lang sein."]),
    });
    expect(passwordRequirements.map((requirement) => requirement.label)).toEqual([
      "8–14 Zeichen",
      "Ein Großbuchstabe",
      "Ein Kleinbuchstabe",
      "Eine Ziffer",
      "Ein Sonderzeichen",
    ]);
  });

  it("stays English while English is selected", async () => {
    await expect(signInSchema.validate({ email: "", password: "" }, { abortEarly: false })).rejects.toMatchObject({
      errors: ["Please enter your email.", "Please enter your password."],
    });
  });
});
