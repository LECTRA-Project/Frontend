import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { lectureMeta } from "./materialTypes.js";
import "./lectures.css";

/*
  Centre panel for lectures the browser can't show inline: slides, Markdown notes, and
  notebooks whose file couldn't be loaded (PDFs use PdfViewerPanel; notebooks normally
  open in the runnable notebook).

  The backend stores the original file and gives its public URL (`s3_url`); it has no
  file, content or reprocess endpoints. So this panel shows the lecture's details with a
  Download link, and an image is shown directly from its URL.

  Props:
    lecture    the backend lecture
    onClose    closes the panel
*/
const PREVIEWABLE_ELSEWHERE = /(pdf|powerpoint|presentation|ipynb|markdown)/;

export default function LectureContentPanel({ lecture, onClose }) {
  const isImage = !PREVIEWABLE_ELSEWHERE.test(lecture.file_type ?? "");
  const icon = /ipynb/.test(lecture.file_type ?? "") ? "notebook" : /powerpoint|presentation/.test(lecture.file_type ?? "") ? "slides" : "book";

  return (
    <section className="panel center-panel lecture-view" aria-label={`Lecture: ${lecture.title}`}>
      <div className="lecture-view__toolbar">
        <div className="lecture-view__file">
          <Icon name={icon} />
          <div className="lecture-view__titles">
            <h2 className="lecture-view__title">{lecture.title}</h2>
            <span className="lecture-view__meta">
              {lecture.original_filename} · {lectureMeta(lecture)}
            </span>
          </div>
        </div>
        <a className="btn btn--secondary btn--sm" href={lecture.s3_url} target="_blank" rel="noopener noreferrer" download>
          <Icon name="download" />
          Download
        </a>
        <IconButton icon="close" label="Close lecture" outlined onClick={onClose} />
      </div>

      <div className="lecture-view__body">
        {lecture.description && <p className="lecture-view__description">{lecture.description}</p>}

        {isImage ? (
          lecture.s3_url && <img className="lecture-view__image" src={lecture.s3_url} alt={lecture.title} />
        ) : (
          <p className="lecture-view__notice" role="status">
            This file can’t be previewed in the browser — use Download to open it.
          </p>
        )}
      </div>
    </section>
  );
}
