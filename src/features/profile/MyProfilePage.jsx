import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Formik, Form } from "formik";

import * as usersApi from "../../api/services/users.js";
import PageShell from "../../components/PageShell.jsx";
import Button from "../../components/ui/Button.jsx";
import FormikTextField from "../../components/ui/FormikTextField.jsx";
import PasswordRequirements from "../../components/ui/PasswordRequirements.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { useI18n } from "../../i18n/i18n.js";
import { getInitials, useAuth } from "../auth/authContext.js";
import { profileSchema } from "../auth/validationSchemas.js";
import "./profile.css";

export default function MyProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();
  const { t } = useI18n();
  const [saved, setSaved] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Editing a field clears the last save message and any earlier server error.
  const clearMessages = (setStatus) => () => {
    setSaved("");
    setStatus(null);
  };

  async function saveProfile(values, { resetForm, setStatus, setFieldError }) {
    setSaved("");
    setStatus(null);

    const fullName = values.fullName.trim();
    const email = values.email.trim();
    const profileChanges = {};
    if (fullName !== user.full_name) profileChanges.fullName = fullName;
    if (email !== user.email) {
      // The email is where reset links go, so the backend asks for the password to change it.
      if (!values.emailPassword) {
        setFieldError("emailPassword", t("Enter your current password to change your email."));
        return;
      }
      profileChanges.email = email;
      profileChanges.currentPassword = values.emailPassword;
    }
    const changingPassword = Boolean(values.currentPassword || values.newPassword || values.confirmPassword);

    if (Object.keys(profileChanges).length === 0 && !changingPassword) {
      setSaved(t("No changes to save."));
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
          emailPassword: "",
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        },
      });
      setSaved(
        t("Profile updated successfully.")
      );
    } catch (error) {
      if (profileWasUpdated) {
        resetForm({
          values: {
            fullName: updatedUser.full_name,
            email: updatedUser.email,
            emailPassword: "",
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          },
        });
        setStatus(t("Profile updated, but the password change failed: {error}", { error: error.message }));
      } else {
        setStatus(error.message);
      }
    }
  }

  return (
    <PageShell title={t("My profile")} subtitle={t("Update your name, email and password.")}>
      <Formik
        initialValues={{
          fullName: user?.full_name ?? "",
          email: user?.email ?? "",
          emailPassword: "",
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }}
        validationSchema={profileSchema}
        onSubmit={saveProfile}
      >
        {({ dirty, isSubmitting, status, setStatus, values }) => (
          <Form noValidate>
            <div className="profile-grid">
              <section className="card" aria-labelledby="details-title">
                <h2 id="details-title" className="card__title">
                  {t("Profile details")}
                </h2>
                <p className="card__subtitle">{t("How you appear in LECTRA.")}</p>

                <div className="profile-identity">
                  <span className="avatar avatar--lg">{getInitials(user)}</span>
                  <div>
                    <p>{user?.full_name}</p>
                    <p className="profile-identity__email">{user?.email}</p>
                  </div>
                </div>

                <div className="card__fields">
                  <FormikTextField
                    label={t("Full name")}
                    name="fullName"
                    onChange={clearMessages(setStatus)}
                  />
                  <FormikTextField
                    label={t("Email")}
                    name="email"
                    type="email"
                    onChange={clearMessages(setStatus)}
                  />
                  {values.email.trim() !== (user?.email ?? "") && (
                    <FormikTextField
                      label={t("Password to confirm the new email")}
                      name="emailPassword"
                      type="password"
                      placeholder={t("Enter your current password")}
                      autoComplete="current-password"
                      onChange={clearMessages(setStatus)}
                    />
                  )}
                </div>
              </section>

              <section className="card" aria-labelledby="password-title">
                <h2 id="password-title" className="card__title">
                  {t("Change password")}
                </h2>
                <p className="card__subtitle">{t("Choose a strong new password.")}</p>

                <div className="card__fields card__fields--tight">
                  <FormikTextField
                    label={t("Current password")}
                    name="currentPassword"
                    type="password"
                    placeholder={t("Enter current password")}
                    autoComplete="current-password"
                    onChange={clearMessages(setStatus)}
                  />
                  <PasswordRequirements name="newPassword" />
                  <FormikTextField
                    label={t("New password")}
                    name="newPassword"
                    type="password"
                    placeholder={t("Enter new password")}
                    autoComplete="new-password"
                    onChange={clearMessages(setStatus)}
                  />
                  <FormikTextField
                    label={t("Confirm new password")}
                    name="confirmPassword"
                    type="password"
                    placeholder={t("Repeat new password")}
                    autoComplete="new-password"
                    onChange={clearMessages(setStatus)}
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
              <Button onClick={() => (dirty ? setConfirmingCancel(true) : navigate("/workspace"))}>
                {t("Cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting || !dirty}>
                {t("Save changes")}
              </Button>
            </div>

            {confirmingCancel && (
              <ConfirmDialog
                title={t("Discard unsaved changes?")}
                confirmLabel={t("Discard changes")}
                danger
                onConfirm={() => navigate("/workspace")}
                onCancel={() => setConfirmingCancel(false)}
              >
                <p>{t("The changes you made to your profile will be lost.")}</p>
              </ConfirmDialog>
            )}
          </Form>
        )}
      </Formik>
    </PageShell>
  );
}
