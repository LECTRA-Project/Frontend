import { useLayoutEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Formik, Form } from "formik";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import PasswordRequirements from "../../components/ui/PasswordRequirements.jsx";
import { resetPassword } from "../../api/services/auth.js";
import { resetPasswordSchema } from "./validationSchemas.js";
import "./auth.css";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const urlToken = searchParams.get("token")?.trim() ?? "";
  const [token] = useState(() => urlToken || location.state?.resetToken || "");

  useLayoutEffect(() => {
    if (urlToken) {
      navigate(location.pathname, {
        replace: true,
        state: { resetToken: urlToken },
      });
    }
  }, [location.pathname, navigate, urlToken]);

  return (
    <main className="auth-page">
      <Brand />

      <Formik
        initialValues={{ newPassword: "", confirmPassword: "" }}
        validationSchema={resetPasswordSchema}
        onSubmit={async (values, { setFieldError, setStatus }) => {
          setStatus({ formError: "" });
          if (!token) {
            setStatus({
              formError: "This password reset link is invalid or missing its token. Request a new link to continue.",
            });
            return;
          }
          try {
            await resetPassword({ token, newPassword: values.newPassword });
            navigate("/", { replace: true, state: { passwordReset: true } });
          } catch (error) {
            const { new_password: newPasswordError, ...otherErrors } = error.fieldErrors ?? {};
            if (newPasswordError) setFieldError("newPassword", newPasswordError);
            setStatus({ formError: otherErrors.token ?? error.message });
          }
        }}
      >
        {({ isSubmitting, status }) => (
      <Form className="auth-card" noValidate>
        <div className="auth-card__intro">
          <h1 className="auth-card__title">Reset your password</h1>
          <p className="auth-card__subtitle">Choose a new password for your LECTRA account.</p>
        </div>

        {!token && (
          <p className="auth-card__alert auth-card__alert--info" role="status">
            This link is missing its reset token. <Link to="/forget-password">Request a new link</Link>.
          </p>
        )}
        {status?.formError && (
          <p className="auth-card__alert" role="alert">
            {status.formError}
          </p>
        )}

        <FormikTextField
          label="New password"
          name="newPassword"
          type="password"
          placeholder="Enter new password"
          maxLength={14}
          autoComplete="new-password"
          required
        />
        <PasswordRequirements name="newPassword" />
        <FormikTextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          maxLength={14}
          autoComplete="new-password"
          required
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          className="auth-card__submit"
          disabled={isSubmitting || !token}
        >
          {isSubmitting ? "Resetting password…" : "Reset password"}
        </Button>

        <p className="auth-card__switch">
          Remember your password? <Link to="/">Sign in</Link>
        </p>
      </Form>
        )}
      </Formik>
    </main>
  );
}
