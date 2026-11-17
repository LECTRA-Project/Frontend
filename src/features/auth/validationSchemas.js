import * as Yup from "yup";

import { t } from "../../i18n/i18n.js";

/*
  Messages and labels are functions or getters so they are translated when they are shown,
  not when this module is imported (signed out, the interface is English).
*/

export const emailSchema = Yup.string()
  .trim()
  .email(() => t("Please enter a valid email."))
  .required(() => t("Please enter your email."));

export const signInSchema = Yup.object({
  email: emailSchema,
  password: Yup.string().required(() => t("Please enter your password.")),
});

export const passwordRequirements = [
  {
    key: "length",
    get label() {
      return t("8–14 characters");
    },
    message: (subject) => t("{subject} must be between 8 and 14 characters.", { subject }),
    validate: (value) => value.length >= 8 && value.length <= 14,
  },
  {
    key: "uppercase",
    get label() {
      return t("An uppercase letter");
    },
    message: (subject) => t("{subject} must include an uppercase letter.", { subject }),
    validate: (value) => /[A-Z]/.test(value),
  },
  {
    key: "lowercase",
    get label() {
      return t("A lowercase letter");
    },
    message: (subject) => t("{subject} must include a lowercase letter.", { subject }),
    validate: (value) => /[a-z]/.test(value),
  },
  {
    key: "number",
    get label() {
      return t("A number");
    },
    message: (subject) => t("{subject} must include a number.", { subject }),
    validate: (value) => /[0-9]/.test(value),
  },
  {
    key: "special",
    get label() {
      return t("A special character");
    },
    message: (subject) => t("{subject} must include a special character.", { subject }),
    validate: (value) => /[^A-Za-z0-9\s]/.test(value),
  },
];

/* `subject` returns the translated field name ("Password" or "New password"). */
function strongPasswordRules(schema, subject) {
  return passwordRequirements.reduce(
    (currentSchema, requirement) =>
      currentSchema.test(requirement.key, () => requirement.message(subject()), (value) =>
        !value || requirement.validate(value)
      ),
    schema
  );
}

const newPasswordSchema = () =>
  strongPasswordRules(Yup.string(), () => t("Password")).required(() => t("Password is required."));

export const createAccountSchema = Yup.object({
  fullName: Yup.string().trim().required(() => t("Please enter your full name.")),
  email: emailSchema,
  password: newPasswordSchema(),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], () => t("The passwords don’t match."))
    .required(() => t("Please repeat your password.")),
});

export const forgotPasswordSchema = Yup.object({ email: emailSchema });

export const resetPasswordSchema = Yup.object({
  newPassword: newPasswordSchema(),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("newPassword")], () => t("The passwords don’t match."))
    .required(() => t("Please confirm your new password.")),
});

const optionalPassword = () => Yup.string().transform((value) => (value === "" ? undefined : value)).optional();

const optionalNewPasswordSchema = () =>
  strongPasswordRules(optionalPassword(), () => t("New password")).optional();

export const profileSchema = Yup.object({
  fullName: Yup.string().trim().required(() => t("Please enter your full name.")),
  email: emailSchema,
  currentPassword: optionalPassword(),
  newPassword: optionalNewPasswordSchema(),
  confirmPassword: optionalPassword(),
}).test("password-change", function validatePasswordChange(values) {
  const { currentPassword, newPassword, confirmPassword } = values ?? {};
  if (!currentPassword && !newPassword && !confirmPassword) return true;
  if (!currentPassword) {
    return this.createError({
      path: "currentPassword",
      message: t("To change your password, enter your current password."),
    });
  }
  if (!newPassword) {
    return this.createError({
      path: "newPassword",
      message: t("Please enter a new password."),
    });
  }
  if (!confirmPassword) {
    return this.createError({
      path: "confirmPassword",
      message: t("Please confirm your new password."),
    });
  }
  if (newPassword !== confirmPassword) {
    return this.createError({
      path: "confirmPassword",
      message: t("The new passwords don’t match."),
    });
  }
  return true;
});
