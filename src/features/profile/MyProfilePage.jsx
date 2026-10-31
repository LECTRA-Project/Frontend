import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Formik, Form } from "formik";

import PageShell from "../../components/PageShell.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import PasswordRequirements from "../../components/ui/PasswordRequirements.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import { getInitials, useAuth } from "../auth/authContext.js";
import { profileSchema } from "../auth/validationSchemas.js";
import "./profile.css";

/*
  My profile — username, email and change password.
  DEMO MODE: "Save changes" only checks the form locally. Nothing is saved.
*/
export default function MyProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);

  return (
    <PageShell title="My profile" subtitle="Update your username, email and password.">
      <Formik
        initialValues={{
          username: "",
          email: "",
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }}
        validationSchema={profileSchema}
        onSubmit={() => setSaved(true)}
      >
        <Form noValidate>
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
              <FormikTextField
                label="Username"
                name="username"
                placeholder={user?.full_name}
                onChange={() => setSaved(false)}
              />
              <FormikTextField
                label="Email"
                name="email"
                type="email"
                placeholder={user?.email}
                onChange={() => setSaved(false)}
              />
            </div>
          </section>

          <section className="card" aria-labelledby="password-title">
            <h2 id="password-title" className="card__title">
              Change password
            </h2>
            <p className="card__subtitle">Choose a strong new password.</p>

            <div className="card__fields card__fields--tight">
              <FormikTextField
                label="Current password"
                name="currentPassword"
                type="password"
                placeholder="Enter current password"
                autoComplete="current-password"
                onChange={() => setSaved(false)}
              />
              <PasswordRequirements name="newPassword" />
              <FormikTextField
                label="New password"
                name="newPassword"
                type="password"
                maxLength={14}
                placeholder="Enter new password"
                autoComplete="new-password"
                onChange={() => setSaved(false)}
              />
              <FormikTextField
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                maxLength={14}
                placeholder="Repeat new password"
                autoComplete="new-password"
                onChange={() => setSaved(false)}
              />
            </div>
          </section>
        </div>

        <div className="page-actions">
          {saved && (
            <TransientStatus onDismiss={() => setSaved(false)}>
              <p className="notice notice--accent" role="status">
                Demo mode — changes are not saved yet.
              </p>
            </TransientStatus>
          )}
          <Button onClick={() => navigate("/workspace")}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </div>
        </Form>
      </Formik>
    </PageShell>
  );
}
