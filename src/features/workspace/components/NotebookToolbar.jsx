import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";

/* The bar above the notebook: file name, Draft label, Run and Add cell. */
export default function NotebookToolbar({ fileName, onRun, onAddCell }) {
  return (
    <div className="panel__header notebook-toolbar">
      <div className="notebook-toolbar__file">
        <Icon name="notebook" />
        <h2 className="panel__title">{fileName}</h2>
        <span className="pill">Draft</span>
      </div>
      <div className="notebook-toolbar__actions">
        <Button variant="ghost" icon="play" onClick={onRun}>
          Run
        </Button>
        <Button variant="ghost" icon="plus" onClick={onAddCell}>
          Add cell
        </Button>
      </div>
    </div>
  );
}
