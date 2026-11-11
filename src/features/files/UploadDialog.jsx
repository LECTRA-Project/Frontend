import { useRef, useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { ACCEPTED_EXTENSIONS, hasAcceptedExtension } from "../lectures/materialTypes.js";
import "./files.css";

/*
  Upload dialog — used by "Upload materials" and the + button in the assistant.

  The picked files are handed to `onUpload(files, { course })`; the workspace uploads
  them to the backend (POST /student_profile/upload-lecture). Each file becomes a
  lecture titled after its file name; AI processing starts automatically and the
  progress shows in the Course materials list.
*/
const ACCEPTED = ACCEPTED_EXTENSIONS.join(",");
const MAX_BYTES = 100 * 1024 * 1024;

export default function UploadDialog({ onCancel, onUpload }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [course, setCourse] = useState("");
  const [rejected, setRejected] = useState([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(fileList) {
    const picked = Array.from(fileList);
    const ok = picked.filter((file) => hasAcceptedExtension(file.name) && file.size > 0 && file.size <= MAX_BYTES);
    setRejected(picked.filter((file) => !ok.includes(file)).map((file) => file.name));
    setFiles((current) => [...current, ...ok]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <Modal title="Upload lecture materials" width={480} onClose={onCancel}>
      <div className="upload">
        <div
          className={`upload__drop ${dragging ? "upload__drop--active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="upload__drop-icon">
            <Icon name="uploadCloud" />
          </span>
          <p className="upload__drop-title">Drag and drop files here</p>
          <p className="upload__or">or</p>
          <Button onClick={() => inputRef.current?.click()}>Choose files</Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            hidden
            data-testid="upload-input"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = ""; // allows picking the same file again
            }}
          />
        </div>

        <p className="upload__help">Supported: PDF, slides (PPT, PPTX) and notebooks (IPYNB), up to 100 MB each.</p>

        {rejected.length > 0 && (
          <p className="field__error" role="alert">
            Not added (unsupported type, empty or over 100 MB): {rejected.join(", ")}
          </p>
        )}

        {files.length > 0 && (
          <ul className="upload__list" aria-label="Selected files">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <Icon name="fileText" size={16} />
                <span className="upload__file-name">{file.name}</span>
                <button
                  type="button"
                  className="upload__remove"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <TextField
          label="Course (optional)"
          value={course}
          maxLength={255}
          placeholder="e.g. Grundlagen der KI"
          onChange={(event) => setCourse(event.target.value)}
        />

        <p className="upload__local-note">
          Files are saved to your account. Lectra then reads them so the study assistant can answer questions about them.
        </p>

        <div className="upload__actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={files.length === 0} onClick={() => onUpload(files, { course: course.trim() })}>
            Upload
          </Button>
        </div>
      </div>
    </Modal>
  );
}
