import * as Yup from "yup";

export const emailSchema = Yup.string()
  .trim()
  .email("Please enter a valid email.")
  .required("Please enter your email.");

export const signInSchema = Yup.object({
  email: emailSchema,
  password: Yup.string().required("Please enter your password."),
});

export const passwordRequirements = [
  {
    key: "length",
    label: "8–14 characters",
    message: "Password must be between 8 and 14 characters.",
    validate: (value) => value.length >= 8 && value.length <= 14,
  },
  {
    key: "uppercase",
    label: "An uppercase letter",
    message: "Password must include an uppercase letter.",
    validate: (value) => /[A-Z]/.test(value),
  },
  {
    key: "lowercase",
    label: "A lowercase letter",
    message: "Password must include a lowercase letter.",
    validate: (value) => /[a-z]/.test(value),
  },
  {
    key: "number",
    label: "A number",
    message: "Password must include a number.",
    validate: (value) => /[0-9]/.test(value),
  },
  {
    key: "special",
    label: "A special character",
    message: "Password must include a special character.",
    validate: (value) => /[^A-Za-z0-9\s]/.test(value),
  },
];

function strongPasswordRules(schema, label) {
  return passwordRequirements.reduce(
    (currentSchema, requirement) =>
      currentSchema.test(requirement.key, requirement.message.replace("Password", label), (value) =>
        !value || requirement.validate(value)
      ),
    schema
  );
}

const newPasswordSchema = (label) =>
  strongPasswordRules(Yup.string(), label).required(`${label} is required.`);

export const createAccountSchema = Yup.object({
  fullName: Yup.string().trim().required("Please enter your full name."),
  email: emailSchema,
  password: newPasswordSchema("Password"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "The passwords don’t match.")
    .required("Please repeat your password."),
});

export const forgotPasswordSchema = Yup.object({ email: emailSchema });

export const resetPasswordSchema = Yup.object({
  newPassword: newPasswordSchema("Password"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("newPassword")], "The passwords don’t match.")
    .required("Please confirm your new password."),
});

const optionalTrimmedString = () =>
  Yup.string()
    .transform((value) => (typeof value === "string" && value.trim() === "" ? undefined : value?.trim()))
    .optional();

const optionalPassword = () => Yup.string().transform((value) => (value === "" ? undefined : value)).optional();

const optionalNewPasswordSchema = () =>
  strongPasswordRules(optionalPassword(), "New password").optional();

export const profileSchema = Yup.object({
  username: optionalTrimmedString(),
  email: Yup.string()
    .transform((value) => (typeof value === "string" && value.trim() === "" ? undefined : value?.trim()))
    .email("Please enter a valid email.")
    .optional(),
  currentPassword: optionalPassword(),
  newPassword: optionalNewPasswordSchema(),
  confirmPassword: optionalPassword(),
}).test("password-change", function validatePasswordChange(values) {
  const { currentPassword, newPassword, confirmPassword } = values ?? {};
  if (!currentPassword && !newPassword && !confirmPassword) return true;
  if (!currentPassword) {
    return this.createError({
      path: "currentPassword",
      message: "To change your password, enter your current password.",
    });
  }
  if (!newPassword) {
    return this.createError({
      path: "newPassword",
      message: "Please enter a new password.",
    });
  }
  if (!confirmPassword) {
    return this.createError({
      path: "confirmPassword",
      message: "Please confirm your new password.",
    });
  }
  if (newPassword !== confirmPassword) {
    return this.createError({
      path: "confirmPassword",
      message: "The new passwords don’t match.",
    });
  }
  return true;
});
