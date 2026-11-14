import { useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import { useI18n } from "../../i18n/i18n.js";
import "./lectures.css";

/*
  Confirms deleting a lecture from the library (DELETE /student_profile/lectures/{id}): its
  file and extracted content are removed, and it leaves every chat that used it. The chats
  and their messages stay. Removing a lecture from one chat only is the × in the menu.
*/
export default function DeleteLectureDialog({ lecture, onConfirm, onCancel }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err);
      setDeleting(false);
    }
  }

  return (
    <Modal title={t("Delete from library?")} width={440} onClose={onCancel}>
      <div className="lecture-form">
        <p>
          <strong>{lecture.title}</strong>{" "}
          {t(
            "({file}) will be deleted permanently and removed from every chat that uses it. The chats and their messages are kept. This can’t be undone.",
            { file: lecture.original_filename }
          )}
        </p>
        {error && (
          <p className="field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="upload__actions">
          <Button onClick={onCancel} disabled={deleting}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" className="btn--danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? t("Deleting…") : t("Delete from library")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
