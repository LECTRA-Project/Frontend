import { useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { useI18n } from "../../i18n/i18n.js";
import "./lectures.css";

/*
  Renames a lecture in the student's library. The backend stores only the title
  (PATCH /student_profile/lectures/{id} with { title }), so that is all this edits.
  An unchanged title just closes the dialog.

  Props:
    lecture   the backend lecture
    onSave    async (title) => void — throws ApiError on failure
    onCancel  closes the dialog
*/
export default function EditLectureDialog({ lecture, onSave, onCancel }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(lecture.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = title.trim();
  const titleError = trimmed ? null : t("Title is required");

  async function handleSubmit(event) {
    event.preventDefault();
    if (titleError) return;
    if (trimmed === lecture.title) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <Modal title={t("Rename lecture")} width={440} onClose={onCancel}>
      <form className="lecture-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label={t("Title")}
          value={title}
          maxLength={255}
          autoFocus
          error={titleError ?? error?.fieldErrors?.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <p className="lecture-form__hint">{t("File: {file}. The new title shows in every chat that uses it.", { file: lecture.original_filename })}</p>

        {error && !error.fieldErrors?.title && (
          <p className="field__error" role="alert">
            {error.message}
          </p>
        )}

        <div className="upload__actions">
          <Button onClick={onCancel} disabled={saving}>
            {t("Cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || Boolean(titleError)}>
            {saving ? t("Saving…") : t("Rename")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
