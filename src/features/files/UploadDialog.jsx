import { useRef, useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { ACCEPTED_EXTENSIONS, materialTypeOf, SUPPORTED_LABEL } from "../../services/materials/materialTypes.js";
import "./files.css";

/*
  Upload dialog — used by "Upload materials" and the upload buttons of the chat.

  The picked files are handed to `onUpload(files)`; the workspace uploads them to the
  backend (POST /student_profile/upload-lecture). Each file becomes a lecture titled
  after its file name; processing starts automatically and the progress shows where the
  upload started. Only the file types the backend accepts can be picked (see
  services/materials/materialTypes.js); unsupported, empty or oversized files are listed
  with a warning and left out.

  Props:
    basic      true when the backend has no AI processing (only changes the default note)
    note       optional text under the list (defaults to where the files are saved)
    onCancel   closes the dialog
    onUpload   called with the accepted files
*/
const MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_NOTE =
  "Files are saved to your account. Lectra then reads them so the study assistant can answer questions about them.";
const BASIC_NOTE = "Files are saved to your account.";
const isAccepted = (name) => materialTypeOf(name) !== null;

export default function UploadDialog({ basic = false, note, onCancel, onUpload }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
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
            accept={ACCEPTED_EXTENSIONS}
            multiple
            hidden
            data-testid="upload-input"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = ""; // allows picking the same file again
            }}
          />
        </div>

        <p className="upload__help">Supported: {SUPPORTED_LABEL}, up to 100 MB each.</p>

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

        <p className="upload__local-note">{note ?? (basic ? BASIC_NOTE : DEFAULT_NOTE)}</p>

        <div className="upload__actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={files.length === 0} onClick={() => onUpload(files)}>
            Upload
          </Button>
        </div>
      </div>
    </Modal>
  );
}
