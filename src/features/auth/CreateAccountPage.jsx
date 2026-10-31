import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Formik, Form } from "formik";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import PasswordRequirements from "../../components/ui/PasswordRequirements.jsx";
import { useAuth } from "./authContext.js";
import { createAccountSchema } from "./validationSchemas.js";
import "./auth.css";

/*
  Create-account screen.
  Sends the form to POST /api/auth/register. The backend returns no token on register,
  so on success we sign in with the same credentials; GuestOnly (RouteGuards.jsx) then
  opens the workspace.
*/
export default function CreateAccountPage() {
  const navigate = useNavigate();
  const { register, login } = useAuth();
  const [formError, setFormError] = useState("");

  return (
    <main className="auth-page">
      <Brand />

      <Formik
        initialValues={{ fullName: "", email: "", password: "", confirmPassword: "" }}
        validationSchema={createAccountSchema}
        onSubmit={async (values, { setFieldError }) => {
          setFormError("");
          const credentials = { email: values.email.trim(), password: values.password };
          try {
            await register({ ...credentials, fullName: values.fullName.trim() });
          } catch (error) {
            const { full_name: fullNameError, ...fieldErrors } = error.fieldErrors ?? {};
            for (const [field, message] of Object.entries(fieldErrors)) {
              if (["email", "password"].includes(field)) setFieldError(field, message);
            }
            if (fullNameError) setFieldError("fullName", fullNameError);
            setFormError(error.message);
            return;
          }

          try {
            await login(credentials);
          } catch {
            navigate("/");
          }
        }}
      >
        {({ isSubmitting }) => (
      <Form className="auth-card" noValidate>
        <div className="auth-card__intro">
          <h1 className="auth-card__title">Create an account</h1>
          <p className="auth-card__subtitle">Set up your LECTRA study workspace.</p>
        </div>

        {formError && (
          <p className="auth-card__alert" role="alert">
            {formError}
          </p>
        )}

        <FormikTextField
          label="Full name"
          name="fullName"
          placeholder="Your full name"
          autoComplete="name"
          required
        />
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
          maxLength={14}
          placeholder="Create a password"
          autoComplete="new-password"
          required
        />
        <PasswordRequirements name="password" />
        <FormikTextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          maxLength={14}
          placeholder="Repeat your password"
          autoComplete="new-password"
          required
        />

        <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="auth-card__switch">
          Already have an account? <Link to="/">Sign in</Link>
        </p>
      </Form>
        )}
      </Formik>
    </main>
  );
}
