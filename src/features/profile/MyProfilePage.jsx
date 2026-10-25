import { useState } from "react";
import { useNavigate } from "react-router-dom";

import PageShell from "../../components/PageShell.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { getInitials, useAuth } from "../auth/authContext.js";
import "./profile.css";

/*
  My profile — username, email and change password.
  DEMO MODE: "Save changes" only checks the form locally. Nothing is saved.
*/
export default function MyProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    username: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
    setSaved(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = form;
    const changingPassword = currentPassword || newPassword || confirmPassword;

    if (changingPassword && (!currentPassword || !newPassword)) {
      setError("To change your password, fill in your current and new password.");
    } else if (newPassword && newPassword.length < 8) {
      setError("The new password needs at least 8 characters.");
    } else if (newPassword !== confirmPassword) {
      setError("The new passwords don’t match.");
    } else {
      setError("");
      setSaved(true);
    }
  }

  return (
    <PageShell title="My profile" subtitle="Update your username, email and password.">
      <form onSubmit={handleSubmit} noValidate>
        <div className="profile-grid">
          <section className="card" aria-labelledby="details-title">
            <h2 id="details-title" className="card__title">
              Profile details
            </h2>
            <p className="card__subtitle">How you appear in LECTRA.</p>

            <div className="profile-identity">
              <span className="avatar avatar--lg">{getInitials(user)}</span>
              <div>
                <p>{user?.full_name}</p>
                <p className="profile-identity__email">{user?.email}</p>
              </div>
            </div>

            <div className="card__fields">
              <TextField label="Username" name="username" placeholder={user?.full_name} value={form.username} onChange={handleChange} />
              <TextField label="Email" name="email" type="email" placeholder={user?.email} value={form.email} onChange={handleChange} />
            </div>
          </section>

          <section className="card" aria-labelledby="password-title">
            <h2 id="password-title" className="card__title">
              Change password
            </h2>
            <p className="card__subtitle">Use at least 8 characters.</p>

            <div className="card__fields card__fields--tight">
              <TextField
                label="Current password"
                name="currentPassword"
                type="password"
                placeholder="Enter current password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={handleChange}
              />
              <TextField
                label="New password"
                name="newPassword"
                type="password"
                placeholder="Enter new password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={handleChange}
              />
              <TextField
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                placeholder="Repeat new password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
              />
            </div>
          </section>
        </div>

        <div className="page-actions">
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="notice notice--accent" role="status">
              Demo mode — changes are not saved yet.
            </p>
          )}
          <Button onClick={() => navigate("/workspace")}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
