import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Brand from "../../components/Brand.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import "./auth.css";

/*
  Sign-in screen.
  DEMO MODE: there is no authentication yet. If both fields are filled in, the
  button opens the workspace. Nothing is sent anywhere and no account is checked.
*/
export default function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});

  function handleSubmit(event) {
    event.preventDefault();

    const newErrors = {};
    if (!email.trim()) newErrors.email = "Please enter your email.";
    if (!password) newErrors.password = "Please enter your password.";
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
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-card__subtitle">Continue to your study workspace.</p>
        </div>

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

        <Button type="submit" variant="primary" fullWidth className="auth-card__submit">
          Sign in
        </Button>

        <p className="auth-card__switch">
          New to LECTRA? <Link to="/create-account">Create an account</Link>
        </p>
      </form>

      <p className="auth-demo-note">
        Demo mode — sign-in isn’t connected yet. Any email and password open the prototype workspace;
        no account is checked.
      </p>
    </main>
  );
}
