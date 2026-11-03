import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Formik, Form } from "formik";

import * as usersApi from "../../api/services/users.js";
import PageShell from "../../components/PageShell.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import PasswordRequirements from "../../components/ui/PasswordRequirements.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import { getInitials, useAuth } from "../auth/authContext.js";
import { profileSchema } from "../auth/validationSchemas.js";
import "./profile.css";

export default function MyProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();
  const [saved, setSaved] = useState("");

  async function saveProfile(values, { resetForm, setStatus }) {
    setSaved("");
    setStatus(null);

    const fullName = values.fullName.trim();
    const email = values.email.trim();
    const profileChanges = {};
    if (fullName !== user.full_name) profileChanges.fullName = fullName;
    if (email !== user.email) profileChanges.email = email;
    const changingPassword = Boolean(values.currentPassword || values.newPassword || values.confirmPassword);

    if (Object.keys(profileChanges).length === 0 && !changingPassword) {
      setSaved("No changes to save.");
      return;
    }

    let updatedUser = user;
    let profileWasUpdated = false;
    try {
      if (Object.keys(profileChanges).length > 0) {
        updatedUser = await usersApi.updateCurrentUser(profileChanges);
        updateUser(updatedUser);
        profileWasUpdated = true;
      }

      if (changingPassword) {
        await usersApi.changeCurrentPassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
        logout("password-changed");
        navigate("/", { replace: true });
        return;
      }

      resetForm({
        values: {
          fullName: updatedUser.full_name,
          email: updatedUser.email,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        },
      });
      setSaved(
        "Profile updated successfully."
      );
    } catch (error) {
      if (profileWasUpdated) {
        resetForm({
          values: {
            fullName: updatedUser.full_name,
            email: updatedUser.email,
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          },
        });
        setStatus(`Profile updated, but the password change failed: ${error.message}`);
      } else {
        setStatus(error.message);
      }
    }
  }

  return (
    <PageShell title="My profile" subtitle="Update your name, email and password.">
      <Formik
        initialValues={{
          fullName: user?.full_name ?? "",
          email: user?.email ?? "",
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }}
        validationSchema={profileSchema}
        onSubmit={saveProfile}
      >
        {({ dirty, isSubmitting, status }) => (
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
                    label="Full name"
                    name="fullName"
                    onChange={() => setSaved("")}
                  />
                  <FormikTextField
                    label="Email"
                    name="email"
                    type="email"
                    onChange={() => setSaved("")}
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
                    onChange={() => setSaved("")}
                  />
                  <PasswordRequirements name="newPassword" />
                  <FormikTextField
                    label="New password"
                    name="newPassword"
                    type="password"
                    maxLength={14}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    onChange={() => setSaved("")}
                  />
                  <FormikTextField
                    label="Confirm new password"
                    name="confirmPassword"
                    type="password"
                    maxLength={14}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    onChange={() => setSaved("")}
                  />
                </div>
              </section>
            </div>

            <div className="page-actions">
              {status && <p className="profile__error" role="alert">{status}</p>}
              {saved && (
                <TransientStatus onDismiss={() => setSaved("")}>
                  <p className="notice notice--accent" role="status">
                    {saved}
                  </p>
                </TransientStatus>
              )}
              <Button onClick={() => navigate("/workspace")}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={isSubmitting || !dirty}>
                Save changes
              </Button>
            </div>
          </Form>
        )}
      </Formik>
    </PageShell>
  );
}
