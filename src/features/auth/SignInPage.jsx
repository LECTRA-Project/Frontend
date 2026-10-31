import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Formik, Form } from "formik";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import { useAuth } from "./authContext.js";
import { signInSchema } from "./validationSchemas.js";
import "./auth.css";

/*
  Sign-in screen.
  Sends the form to POST /api/auth/login. On success the auth state flips to
  "authenticated" and GuestOnly (RouteGuards.jsx) moves the user on to the workspace,
  or back to the page they were trying to open.
*/
export default function SignInPage() {
  const { login, signOutReason } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");

  return (
    <main className="auth-page">
      <Brand />

      <Formik
        initialValues={{ email: "", password: "" }}
        validationSchema={signInSchema}
        onSubmit={async (values, { setFieldError }) => {
          setFormError("");
          try {
            await login({ email: values.email.trim(), password: values.password });
          } catch (error) {
            for (const [field, message] of Object.entries(error.fieldErrors ?? {})) {
              if (field === "email" || field === "password") setFieldError(field, message);
            }
            setFormError(error.message);
          }
        }}
      >
        {({ isSubmitting }) => (
      <Form className="auth-card" noValidate>
        <div className="auth-card__intro">
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-card__subtitle">Continue to your study workspace.</p>
        </div>

        {formError ? (
          <p className="auth-card__alert" role="alert">
            {formError}
          </p>
        ) : location.state?.passwordReset ? (
          <TransientStatus onDismiss={() => navigate(location.pathname, { replace: true, state: null })}>
            <p className="auth-card__alert auth-card__alert--info" role="status">
              Your password has been reset. Please sign in with your new password.
            </p>
          </TransientStatus>
        ) : (
          signOutReason === "expired" && (
            <p className="auth-card__alert auth-card__alert--info" role="status">
              Your session has expired. Please sign in again.
            </p>
          )
        )}

        <FormikTextField
          label="Email"
          name="email"
          type="email"
          placeholder="name@university.edu"
          autoComplete="email"
          required
        />
        <FormikTextField
          label="Password"
          name="password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
        <p className="auth-card__forgot-password">
          <Link to="/forget-password">Forgot password?</Link>
        </p>

        <Button type="submit" variant="primary" fullWidth className="auth-card__submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>

        <p className="auth-card__switch">
          New to LECTRA? <Link to="/create-account">Create an account</Link>
        </p>
      </Form>
        )}
      </Formik>
    </main>
  );
}
