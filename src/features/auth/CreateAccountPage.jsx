import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import "./auth.css";

/*
  Create-account screen.
  DEMO MODE: no account is created. When the form is valid, the button opens the
  workspace.
*/
export default function CreateAccountPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});

  // One change handler for all four fields, using the input's name.
  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const newErrors = {};
    if (!form.username.trim()) newErrors.username = "Please choose a username.";
    if (!form.email.trim()) newErrors.email = "Please enter your email.";
    if (!form.password) newErrors.password = "Please create a password.";
    if (!form.confirmPassword) newErrors.confirmPassword = "Please repeat your password.";
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = "The passwords don’t match.";
    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      navigate("/workspace");
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

        <TextField
          label="Username"
          name="username"
          placeholder="Choose a username"
          autoComplete="username"
          required
          value={form.username}
          onChange={handleChange}
          error={errors.username}
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

        <Button type="submit" variant="primary" fullWidth>
          Create account
        </Button>

        <p className="auth-card__switch">
          Already have an account? <Link to="/">Sign in</Link>
        </p>
      </form>

      <p className="auth-demo-note">Demo mode — no account is created or stored.</p>
    </main>
  );
}
