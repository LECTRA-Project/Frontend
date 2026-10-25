import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { useAuth } from "./authContext.js";
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
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // One change handler for all four fields, using the input's name.
  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const newErrors = {};
    if (!form.fullName.trim()) newErrors.fullName = "Please enter your full name.";
    if (!form.email.trim()) newErrors.email = "Please enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) newErrors.email = "Please enter a valid email.";
    if (!form.password) newErrors.password = "Please create a password.";
    if (!form.confirmPassword) newErrors.confirmPassword = "Please repeat your password.";
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = "The passwords don’t match.";
    setErrors(newErrors);
    setFormError("");

    if (Object.keys(newErrors).length > 0) return;

    const credentials = { email: form.email.trim(), password: form.password };
    setSubmitting(true);
    try {
      await register({ ...credentials, fullName: form.fullName.trim() });
    } catch (error) {
      // Map backend field names (full_name) onto the form's field names.
      const { full_name: fullName, ...fieldErrors } = error.fieldErrors ?? {};
      setErrors(fullName ? { ...fieldErrors, fullName } : fieldErrors);
      setFormError(error.message);
      setSubmitting(false);
      return;
    }

    try {
      await login(credentials);
    } catch {
      // The account exists, only the automatic sign-in failed: let the user sign in manually.
      navigate("/");
    }
  }

  return (
    <main className="auth-page">
      <Brand />

      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-card__intro">
          <h1 className="auth-card__title">Create an account</h1>
          <p className="auth-card__subtitle">Set up your LECTRA study workspace.</p>
        </div>

        {formError && (
          <p className="auth-card__alert" role="alert">
            {formError}
          </p>
        )}

        <TextField
          label="Full name"
          name="fullName"
          placeholder="Your full name"
          autoComplete="name"
          required
          value={form.fullName}
          onChange={handleChange}
          error={errors.fullName}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          placeholder="name@university.edu"
          autoComplete="email"
          required
          value={form.email}
          onChange={handleChange}
          error={errors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          placeholder="Create a password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={handleChange}
          error={errors.password}
        />
        <TextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
        />

        <Button type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="auth-card__switch">
          Already have an account? <Link to="/">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
