import { useRef, useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import TextField from "../../components/ui/TextField.jsx";
import { ACCEPTED_EXTENSIONS, materialTypeOf, SUPPORTED_LABEL } from "../../services/materials/materialTypes.js";
import "./files.css";

/*
  Upload dialog — used by "Upload materials" and the + button in the assistant.

  The picked files are handed to `onUpload(files, { course })`; the workspace uploads
  them to the backend (POST /student_profile/upload-lecture). Each file becomes a
  lecture titled after its file name; AI processing starts automatically and the
  progress shows in the Course materials list. Unsupported, empty or oversized files
  are listed with a warning and left out.

  Props:
    basic      true when the backend has no AI processing: only the file types it
               accepts (PDF, PPTX, IPYNB) and no course field, which it would ignore
    note       optional text under the list (defaults to where the files are saved)
    onCancel   closes the dialog
    onUpload   called with the accepted files and { course }
*/
const MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_NOTE =
  "Files are saved to your account. Lectra then reads them so the study assistant can answer questions about them.";
const BASIC_NOTE = "Files are saved to your account.";
const BASIC_EXTENSIONS = [".pdf", ".pptx", ".ipynb"];

export default function UploadDialog({ basic = false, note, onCancel, onUpload }) {
  const accepted = basic ? BASIC_EXTENSIONS.join(",") : ACCEPTED_EXTENSIONS;
  const isAccepted = (name) =>
    basic ? BASIC_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)) : Boolean(materialTypeOf(name));
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [course, setCourse] = useState("");
  const [rejected, setRejected] = useState([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(fileList) {
    const picked = Array.from(fileList);
    const ok = picked.filter((file) => isAccepted(file.name) && file.size > 0 && file.size <= MAX_BYTES);
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
            accept={accepted}
            multiple
            hidden
            data-testid="upload-input"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = ""; // allows picking the same file again
            }}
          />
        </div>

        <p className="upload__help">
          {basic
            ? "Supported: PDF, PPTX and IPYNB, up to 100 MB each."
            : `Supported: ${SUPPORTED_LABEL} (PDFs, slides, notebooks and Markdown notes), up to 100 MB each.`}
        </p>

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

        {!basic && (
          <TextField
            label="Course (optional)"
            value={course}
            maxLength={255}
            placeholder="e.g. Grundlagen der KI"
            onChange={(event) => setCourse(event.target.value)}
          />
        )}

        <p className="upload__local-note">{note ?? (basic ? BASIC_NOTE : DEFAULT_NOTE)}</p>

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
