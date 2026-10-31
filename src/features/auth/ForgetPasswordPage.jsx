import { Link } from "react-router-dom";
import { Formik, Form } from "formik";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import { requestPasswordReset } from "../../api/services/auth.js";
import { forgotPasswordSchema } from "./validationSchemas.js";
import "./auth.css";

export default function ForgetPasswordPage() {
  return (
    <main className="auth-page">
      <Brand />

      <Formik
        initialValues={{ email: "" }}
        validationSchema={forgotPasswordSchema}
        onSubmit={async (values, { setFieldError, setStatus }) => {
          setStatus({ formError: "", message: "" });
          try {
            const response = await requestPasswordReset({ email: values.email.trim() });
            setStatus({ message: response.message });
          } catch (error) {
            if (error.fieldErrors?.email) setFieldError("email", error.fieldErrors.email);
            setStatus({ formError: error.message });
          }
        }}
      >
        {({ isSubmitting, status }) => (
      <Form className="auth-card" noValidate>
        <div className="auth-card__intro">
          <h1 className="auth-card__title">Forgot your password?</h1>
          <p className="auth-card__subtitle">Enter your email and we’ll send you a password reset link.</p>
        </div>

        {status?.formError && (
          <p className="auth-card__alert" role="alert">
            {status.formError}
          </p>
        )}
        {status?.message && (
          <TransientStatus key={status.message} onDismiss={() => setStatus({})}>
            <>
              <p className="auth-card__alert auth-card__alert--info" role="status">
                {status.message}
              </p>
              <p className="auth-card__subtitle">
                Check your inbox and open the link in the email to choose a new password.
              </p>
            </>
          </TransientStatus>
        )}

        <FormikTextField
          label="Email"
          name="email"
          type="email"
          placeholder="name@university.edu"
          autoComplete="email"
          required
        />

        <Button type="submit" variant="primary" fullWidth className="auth-card__submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
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
