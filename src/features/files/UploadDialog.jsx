import { useRef, useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import "./files.css";

/*
  Upload dialog — shared by "Upload materials" and the + button in the assistant.

  FRONTEND ONLY: files are picked in the browser and handed to `onUpload(files)`.
  Nothing is sent to a server and nothing is saved; the files disappear when the
  page is reloaded.
*/
const ACCEPTED = ".pdf,.pptx,.ipynb";

export default function UploadDialog({ onCancel, onUpload }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);

  function addFiles(fileList) {
    setFiles((current) => [...current, ...Array.from(fileList)]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <Modal title="Upload files" width={480} onClose={onCancel}>
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
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = ""; // allows picking the same file again
            }}
          />
        </div>

        <p className="upload__help">Supported: PDF, slides (PPTX) and notebooks (IPYNB).</p>

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

        <p className="upload__local-note">Files stay in this browser tab only — they are not uploaded or saved yet.</p>

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
