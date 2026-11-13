import { useRef, useState } from "react";

import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import Menu from "../../../components/ui/Menu.jsx";
import { groupOf } from "../../../services/materials/materialTypes.js";
import { STATUS_LABEL } from "../../lectures/materialTypes.js";
import { groupChats } from "../chatLayout.js";

/*
  The collapsible left menu of the chat-first workspace (272 px; a 64 px icon rail when
  collapsed). Top to bottom: collapse, New chat, the open chat's materials, the chats
  grouped by their last activity.

  "Materials in this chat" lists only the open chat's materials: a click opens one in the
  viewer beside the chat, × removes it from the chat (the lecture itself is kept), and the
  upload button uploads new files into this chat. Lectures already uploaded can be added
  from "Add one of your materials". Each material's ⋯ menu manages it in the library:
  Rename, and Delete from library (it then leaves every chat). A failed one can be retried.
  Each chat's ⋯ menu has Remove, which asks first and then deletes the chat and its messages
  (its materials are kept).

  mode:  "docked"  part of the row
         "overlay" floats over the chat with a scrim (not enough room beside the viewer)
         "phone"   floats over everything; when closed, not even the rail is shown (the
                   header's menu button opens it)

  Props:
    open, mode, onToggle          the menu itself
    onNewChat                     starts a new chat
    chatTitle                     title of the open chat ("New chat" for a new one)
    materials                     the open chat's materials (toMaterial items)
    uploads                       files being uploaded: { id, name, progress, error }
    addable                       the student's other materials (toMaterial items)
    viewerLectureId               the material open in the viewer
    onOpenMaterial(material), onRemoveMaterial(material), onUploadClick(), onAddMaterial(material)
    onRetryMaterial(material)     retries processing a failed material
    onRenameMaterial(material), onDeleteMaterial(material)   open the library dialogs
    onDismissUpload(id)
    sessions, activeId, sessionsLoading, sessionsError, onOpenChat(id), onReloadChats()
    onRemoveChat(session)         deletes a chat after confirmation; resolves true when removed
    available                     false when the server has no chat API
*/
export default function ChatSidebar({
  open,
  mode = "docked",
  onToggle,
  onNewChat,
  chatTitle,
  materials,
  uploads = [],
  addable = [],
  viewerLectureId = null,
  onOpenMaterial,
  onRemoveMaterial,
  onUploadClick,
  onAddMaterial,
  onRetryMaterial,
  onRenameMaterial,
  onDeleteMaterial,
  onDismissUpload,
  sessions,
  activeId,
  sessionsLoading,
  sessionsError,
  onOpenChat,
  onReloadChats,
  onRemoveChat,
  available = true,
}) {
  const [removing, setRemoving] = useState(null); // the chat whose Remove is being confirmed
  const newChatRef = useRef(null);

  if (!open) {
    if (mode === "phone") return null;
    return (
      <nav className="cf-rail" aria-label="Menu">
        <IconButton icon="sidebar" label="Open menu" onClick={onToggle} />
        <IconButton icon="plus" label="New chat" onClick={onNewChat} />
        <IconButton icon="fileText" label="Materials in this chat" onClick={onToggle} />
        <IconButton icon="chat" label="Chats" onClick={onToggle} />
      </nav>
    );
  }

  async function confirmRemove() {
    const session = removing;
    setRemoving(null);
    // The removed row is gone, so focus moves to New chat instead of being lost.
    if (await onRemoveChat(session)) newChatRef.current?.focus();
  }

  const groups = groupChats(sessions);
  const overlay = mode !== "docked";

  return (
    <>
      {overlay && <div className="cf-scrim" aria-hidden="true" onClick={onToggle} />}
      <nav className={`cf-side ${overlay ? "cf-side--overlay" : ""}`} id="chat-menu" aria-label="Chats and this chat's materials">
        <div className="cf-side__new">
          <button ref={newChatRef} type="button" className="cf-new-chat" onClick={onNewChat}>
            <Icon name="plus" />
            New chat
          </button>
          <IconButton icon="sidebar" label={overlay ? "Close menu" : "Collapse menu"} onClick={onToggle} />
        </div>

        <div className="cf-side__scroll">
          <section className="cf-materials" id="cf-materials" tabIndex={-1} aria-labelledby="cf-materials-title">
            <div className="cf-materials__head">
              <h2 id="cf-materials-title" className="cf-section-title">
                Materials in this chat
              </h2>
              <div className="cf-materials__actions">
                {addable.length > 0 && (
                  <Menu
                    label="Add one of your materials to this chat"
                    icon="plus"
                    className="cf-materials__add"
                    items={addable.map((material) => ({
                      key: material.id,
                      label: material.name,
                      icon: groupOf(material.type)?.icon ?? "fileText",
                      onSelect: () => onAddMaterial(material),
                    }))}
                  />
                )}
                <IconButton
                  icon="upload"
                  label="Upload a material to this chat"
                  className="cf-materials__upload"
                  onClick={onUploadClick}
                  disabled={!available}
                />
              </div>
            </div>
            <span className="cf-materials__chat" title={chatTitle}>
              {chatTitle}
            </span>

            {materials.length === 0 && uploads.length === 0 && (
              <button type="button" className="cf-materials__empty" onClick={onUploadClick} disabled={!available}>
                {available ? "Upload a PDF, slides or a notebook for this chat" : "Chats are not available on this server"}
              </button>
            )}

            <ul className="cf-materials__list" aria-label="Materials in this chat">
              {materials.map((material) => {
                const opened = viewerLectureId === material.id;
                const status = material.status && material.status !== "completed" ? STATUS_LABEL[material.status] : null;
                return (
                  <li key={material.id} className={`cf-material ${opened ? "cf-material--open" : ""}`}>
                    <button
                      type="button"
                      className="cf-material__open"
                      aria-label={`Open ${material.name} beside the chat`}
                      aria-pressed={opened}
                      title="Open beside the chat"
                      onClick={() => onOpenMaterial(material)}
                    >
                      <span className="cf-material__icon">
                        <Icon name={material.type === "notebook" ? "code" : groupOf(material.type)?.icon ?? "fileText"} size={16} />
                      </span>
                      <span className="cf-material__text">
                        <span className="cf-material__name">{material.name}</span>
                        <span className="cf-material__meta">
                          {material.meta}
                          {status && <span className={`cf-material__status cf-material__status--${material.status}`}> · {status}</span>}
                        </span>
                      </span>
                    </button>
                    {material.status === "failed" && (
                      <IconButton
                        icon="refresh"
                        label={`Retry processing ${material.name}`}
                        className="cf-material__remove"
                        onClick={() => onRetryMaterial(material)}
                      />
                    )}
                    {/* With a mouse these show on hover or focus, so the name gets the row's width. */}
                    <span className="cf-material__actions">
                      <Menu
                        label={`More actions for ${material.name}`}
                        className="cf-material__more"
                        items={[
                          { label: "Rename", icon: "edit", onSelect: () => onRenameMaterial(material) },
                          "separator",
                          { label: "Delete from library", icon: "trash", danger: true, onSelect: () => onDeleteMaterial(material) },
                        ]}
                      />
                      <IconButton
                        icon="close"
                        label={`Remove ${material.name} from this chat`}
                        className="cf-material__remove"
                        onClick={() => onRemoveMaterial(material)}
                      />
                    </span>
                  </li>
                );
              })}
              {uploads.map((upload) => (
                <li key={upload.id} className="cf-material cf-material--upload">
                  <span className="cf-material__open" aria-label={`Uploading ${upload.name}`}>
                    <span className="cf-material__icon">
                      <Icon name="upload" size={16} />
                    </span>
                    <span className="cf-material__text">
                      <span className="cf-material__name">{upload.name}</span>
                      {upload.error ? (
                        <span className="cf-material__meta cf-material__status--failed" role="alert">
                          {upload.error}
                        </span>
                      ) : (
                        <span className="cf-progress" role="progressbar" aria-label={`Uploading ${upload.name}`} aria-valuenow={upload.progress} aria-valuemin={0} aria-valuemax={100}>
                          <span style={{ width: `${upload.progress}%` }} />
                        </span>
                      )}
                    </span>
                  </span>
                  {upload.error && (
                    <IconButton icon="close" label={`Dismiss ${upload.name}`} className="cf-material__remove" onClick={() => onDismissUpload(upload.id)} />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="cf-chats" aria-labelledby="cf-chats-title">
            <h2 id="cf-chats-title" className="cf-section-title cf-chats__title">
              Chats
            </h2>
            {sessionsLoading && sessions.length === 0 ? (
              <p className="cf-chats__note" role="status">
                Loading your chats…
              </p>
            ) : sessionsError && sessions.length === 0 ? (
              <div className="cf-chats__note" role="alert">
                <p>{sessionsError}</p>
                <button type="button" className="cf-link-button" onClick={onReloadChats}>
                  Try again
                </button>
              </div>
            ) : groups.length === 0 ? (
              <p className="cf-chats__note">{available ? "Your chats will be listed here." : "Chats are not available on this server."}</p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="cf-chats__group">
                  <h3 className="cf-chats__label">{group.label}</h3>
                  <ul className="cf-chats__list" aria-label={group.label}>
                    {group.items.map((session) => {
                      const current = session.id === activeId;
                      return (
                        <li key={session.id} className={`cf-chat-row ${current ? "cf-chat-row--current" : ""}`}>
                          <button
                            type="button"
                            className={`cf-chat ${current ? "cf-chat--current" : ""}`}
                            aria-current={current ? "page" : undefined}
                            title={session.title}
                            onClick={() => onOpenChat(session.id)}
                          >
                            {session.title}
                          </button>
                          {/* Like the material rows: with a mouse, ⋯ shows on hover or focus. It never opens the chat. */}
                          <span className="cf-chat__actions" onClick={(event) => event.stopPropagation()}>
                            <Menu
                              label={`Actions for ${session.title}`}
                              className="cf-chat__more"
                              items={[{ label: "Remove", icon: "trash", danger: true, onSelect: () => setRemoving(session) }]}
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>

        {removing && (
          <ConfirmDialog title="Remove chat?" confirmLabel="Remove" danger onConfirm={confirmRemove} onCancel={() => setRemoving(null)}>
            “{removing.title}” and all its messages will be deleted. Its materials are kept.
          </ConfirmDialog>
        )}
      </nav>
    </>
  );
}
