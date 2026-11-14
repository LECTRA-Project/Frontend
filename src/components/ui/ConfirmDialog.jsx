import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import { useI18n } from "../../i18n/i18n.js";

/*
  ConfirmDialog — asks before an action that cannot be undone.

  Props:
    title          dialog title
    children       explanation shown in the dialog
    confirmLabel   text of the confirm button
    danger         styles the confirm button as destructive
    onConfirm      called when confirmed
    onCancel       called on Cancel, Escape or a click outside
*/
export default function ConfirmDialog({ title, children, confirmLabel, danger = false, onConfirm, onCancel }) {
  const { t } = useI18n();
  return (
    <Modal title={title} width={440} onClose={onCancel}>
      <div className="confirm">
        <div className="confirm__text">{children}</div>
        <div className="confirm__actions">
          <Button onClick={onCancel}>{t("Cancel")}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel ?? t("Confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
