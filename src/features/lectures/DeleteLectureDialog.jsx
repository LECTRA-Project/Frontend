import { useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import "./lectures.css";

/* Confirms deleting a lecture: its file, extracted content and assistant index are removed. */
export default function DeleteLectureDialog({ lecture, onConfirm, onCancel }) {
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
    <Modal title="Delete lecture?" width={440} onClose={onCancel}>
      <div className="lecture-form">
        <p>
          <strong>{lecture.title}</strong> ({lecture.original_filename}) will be deleted permanently, together with
          everything the study assistant learned from it. This can’t be undone.
        </p>
        {error && (
          <p className="field__error" role="alert">
            {error.message}
          </p>
        )}
        <div className="upload__actions">
          <Button onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="primary" className="btn--danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
