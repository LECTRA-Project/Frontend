import { useState } from "react";
import { Link } from "react-router-dom";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { useAuth } from "./authContext.js";
import "./auth.css";

/*
  Sign-in screen.
  Sends the form to POST /api/auth/login. On success the auth state flips to
  "authenticated" and GuestOnly (RouteGuards.jsx) moves the user on to the workspace,
  or back to the page they were trying to open.
*/
export default function SignInPage() {
  const { login, signOutReason } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const newErrors = {};
    if (!email.trim()) newErrors.email = "Please enter your email.";
    if (!password) newErrors.password = "Please enter your password.";
    setErrors(newErrors);
    setFormError("");

    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
    } catch (error) {
      setErrors(error.fieldErrors ?? {});
      setFormError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Brand />

      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-card__intro">
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-card__subtitle">Continue to your study workspace.</p>
        </div>

        {formError ? (
          <p className="auth-card__alert" role="alert">
            {formError}
          </p>
        ) : (
          signOutReason === "expired" && (
            <p className="auth-card__alert auth-card__alert--info" role="status">
              Your session has expired. Please sign in again.
            </p>
          )
        )}

        <TextField
          label="Email"
          type="email"
          placeholder="name@university.edu"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
        />

        <Button type="submit" variant="primary" fullWidth className="auth-card__submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>

        <p className="auth-card__switch">
          New to LECTRA? <Link to="/create-account">Create an account</Link>
        </p>
      </form>
    </main>
  );
}
