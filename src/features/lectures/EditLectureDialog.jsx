import { useRef, useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { ACCEPTED_EXTENSIONS, hasAcceptedExtension } from "./materialTypes.js";
import "./lectures.css";

/*
  Edit a lecture's title, course and description, and optionally replace its file.
  Only changed fields are sent (PATCH is a partial update). Replacing the file makes
  the backend process the new file again; the old content stops being searchable.

  Props:
    lecture   the backend lecture
    onSave    async (changes) => void — throws ApiError on failure
    onCancel  closes the dialog
*/
export default function EditLectureDialog({ lecture, onSave, onCancel }) {
  const fileRef = useRef(null);
  const [title, setTitle] = useState(lecture.title);
  const [course, setCourse] = useState(lecture.course ?? "");
  const [description, setDescription] = useState(lecture.description ?? "");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const titleError = title.trim() ? null : "Title is required";

  async function handleSubmit(event) {
    event.preventDefault();
    if (titleError) return;
    const changes = {};
    if (title.trim() !== lecture.title) changes.title = title.trim();
    if (course.trim() !== (lecture.course ?? "")) changes.course = course.trim();
    if (description.trim() !== (lecture.description ?? "")) changes.description = description.trim();
    if (file) changes.file = file;
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(changes);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit lecture" width={520} onClose={onCancel}>
      <form className="lecture-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Title"
          value={title}
          maxLength={255}
          error={titleError ?? error?.fieldErrors?.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextField
          label="Course"
          value={course}
          maxLength={255}
          error={error?.fieldErrors?.course}
          onChange={(event) => setCourse(event.target.value)}
        />
        <div className="field">
          <label className="field__label" htmlFor="lecture-description">
            Description
          </label>
          <textarea
            id="lecture-description"
            className="field__input lecture-form__textarea"
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="lecture-form__file">
          <span className="field__label">File</span>
          <span className="lecture-form__file-name">{file ? file.name : lecture.original_filename}</span>
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            {file ? "Choose another file" : "Replace file"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={ACCEPTED_EXTENSIONS.join(",")}
            data-testid="replace-file-input"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked && hasAcceptedExtension(picked.name)) setFile(picked);
              event.target.value = "";
            }}
          />
          {file && (
            <p className="notice notice--accent">
              The new file replaces the current one and will be processed again for the assistant.
            </p>
          )}
          {error?.fieldErrors?.file && <span className="field__error">{error.fieldErrors.file}</span>}
        </div>

        {error && !Object.keys(error.fieldErrors ?? {}).length && (
          <p className="field__error" role="alert">
            {error.message}
          </p>
        )}

        <div className="upload__actions">
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || Boolean(titleError)}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
