import { useRef, useState } from "react";

import Modal from "../../components/ui/Modal.jsx";
import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { ACCEPTED_EXTENSIONS, materialTypeOf, SUPPORTED_LABEL } from "../../services/materials/materialTypes.js";
import "./files.css";

/*
  Upload dialog — shared by "Upload materials" and the + button in the assistant.

  Files are picked in the browser and the supported ones are handed to `onUpload(files)`;
  unsupported types are listed with a warning and left out. Nothing is sent to a server
  here — `note` tells the student where the files will be kept.
*/
export default function UploadDialog({ note, onCancel, onUpload }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const supportedFiles = files.filter((file) => materialTypeOf(file.name));

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
            accept={ACCEPTED_EXTENSIONS}
            multiple
            hidden
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = ""; // allows picking the same file again
            }}
          />
        </div>

        <p className="upload__help">Supported: {SUPPORTED_LABEL} (PDFs, slides, notebooks and Markdown notes).</p>

        {files.length > 0 && (
          <ul className="upload__list" aria-label="Selected files">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className={materialTypeOf(file.name) ? "" : "upload__item--rejected"}>
                <Icon name="fileText" size={16} />
                <span className="upload__file-name">{file.name}</span>
                {!materialTypeOf(file.name) && <span className="upload__rejected">Not supported</span>}
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

        <p className="upload__local-note">{note}</p>

        <div className="upload__actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={supportedFiles.length === 0} onClick={() => onUpload(supportedFiles)}>
            Upload
          </Button>
        </div>
      </div>
    </Modal>
  );
}
