import { useEffect, useId, useRef, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { FEEDBACK_TAGS, MAX_FEEDBACK_LENGTH, sendFeedback } from "../../api/services/feedback.js";
import { useI18n } from "../../i18n/i18n.js";
import "./feedback.css";

/*
  "Send feedback" (from the profile menu): a student reports a bug, suggests an idea or
  rates the app. Admins read it in the admin panel; the student only sees a confirmation.

  - Type (required): Bug, Idea, Feedback, Other — radio buttons, so the arrow keys move
    between them.
  - Rating 1–5 (optional), only for the type Feedback. Choosing another type clears it, so
    it is never sent with another type.
  - Description (required): up to 5,000 characters, with a counter; spaces at the ends
    don't count.
  - Send is disabled until a type and a description are there, and while sending (no
    double submit). A 422 shows each field's message at the field; any other error is
    shown in the dialog and the typed text is kept.
  - Sent: "Thanks for your feedback" (announced to screen readers) with Done.

  Props:
    onClose   closes the dialog
*/
const RATINGS = [1, 2, 3, 4, 5];

export default function FeedbackDialog({ onClose }) {
  const { t } = useI18n();
  const [tag, setTag] = useState(null);
  const [rating, setRating] = useState(null);
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null); // a problem with the request as a whole
  const [fieldErrors, setFieldErrors] = useState({});
  const mounted = useRef(true);
  const doneRef = useRef(null);
  const ids = { tag: useId(), rating: useId(), description: useId(), count: useId() };
  // Each type's name and what it is for (written out here so they are translated).
  const tagText = {
    bug: [t("Bug"), t("Something doesn’t work")],
    idea: [t("Idea"), t("Something we could add or improve")],
    feedback: [t("Feedback"), t("How Lectra works for you")],
    other: [t("Other"), t("Anything else")],
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The confirmation's Done button takes the focus (the form it replaces is gone).
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  const trimmed = description.trim();
  const canSend = Boolean(tag) && trimmed.length > 0 && trimmed.length <= MAX_FEEDBACK_LENGTH && !sending;

  function chooseTag(next) {
    setTag(next);
    if (next !== "feedback") setRating(null);
    setFieldErrors(({ tag: _tag, rating: _rating, ...rest }) => rest);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    setFieldErrors({});
    try {
      await sendFeedback({ tag, description: trimmed, rating: tag === "feedback" ? rating : null });
      if (mounted.current) setSent(true);
    } catch (err) {
      if (!mounted.current) return;
      const fields = err?.fieldErrors ?? {};
      if (Object.keys(fields).length > 0) setFieldErrors(fields);
      // A message no field shows (e.g. the server or the network): in the dialog.
      if (!["tag", "description", "rating"].some((name) => fields[name])) {
        setError(err?.message || t("Your feedback could not be sent."));
      }
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  if (sent) {
    return (
      <Modal title={t("Send feedback")} width={480} onClose={onClose}>
        <div className="feedback__sent" role="status">
          <span className="feedback__sent-icon" aria-hidden="true">
            <Icon name="check" size={22} />
          </span>
          <p className="feedback__sent-title">{t("Thanks for your feedback")}</p>
          <p className="feedback__sent-text">{t("It helps us make Lectra better.")}</p>
        </div>
        <div className="feedback__actions">
          <Button ref={doneRef} variant="primary" onClick={onClose}>
            {t("Done")}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("Send feedback")} width={480} onClose={onClose}>
      <form className="feedback" onSubmit={handleSubmit} noValidate>
        <p className="feedback__intro">{t("Tell us what works, what doesn’t, or what you’d like to see in Lectra.")}</p>

        <fieldset className="feedback__group" aria-describedby={fieldErrors.tag ? `${ids.tag}-error` : undefined}>
          <legend className="field__label">{t("What is it about?")}</legend>
          <div className="feedback__tags">
            {FEEDBACK_TAGS.map((item) => (
              <label key={item} className={`feedback__tag ${tag === item ? "feedback__tag--selected" : ""}`}>
                <input
                  type="radio"
                  name={ids.tag}
                  value={item}
                  checked={tag === item}
                  disabled={sending}
                  onChange={() => chooseTag(item)}
                />
                <span className="feedback__tag-name">{tagText[item][0]}</span>
                <span className="feedback__tag-hint">{tagText[item][1]}</span>
              </label>
            ))}
          </div>
          {fieldErrors.tag && (
            <p className="field__error" id={`${ids.tag}-error`} role="alert">
              {fieldErrors.tag}
            </p>
          )}
        </fieldset>

        {tag === "feedback" && (
          <fieldset className="feedback__group" aria-describedby={fieldErrors.rating ? `${ids.rating}-error` : undefined}>
            <legend className="field__label">
              {t("How would you rate Lectra?")} <span className="feedback__optional">{t("(optional)")}</span>
            </legend>
            <div className="feedback__rating">
              {RATINGS.map((value) => (
                <label key={value} className={`feedback__star ${rating && value <= rating ? "feedback__star--on" : ""}`}>
                  <input
                    type="radio"
                    name={ids.rating}
                    value={value}
                    checked={rating === value}
                    disabled={sending}
                    onChange={() => setRating(value)}
                    aria-label={value === 1 ? t("1 star") : t("{count} stars", { count: value })}
                  />
                  <Icon name="star" size={26} />
                </label>
              ))}
              {rating && (
                <button type="button" className="feedback__clear" onClick={() => setRating(null)} disabled={sending}>
                  {t("Clear rating")}
                </button>
              )}
            </div>
            {fieldErrors.rating && (
              <p className="field__error" id={`${ids.rating}-error`} role="alert">
                {fieldErrors.rating}
              </p>
            )}
          </fieldset>
        )}

        <div className={`field ${fieldErrors.description ? "field--invalid" : ""}`}>
          <label className="field__label" htmlFor={ids.description}>
            {t("Your feedback")}
          </label>
          <textarea
            id={ids.description}
            className="field__input feedback__text"
            value={description}
            rows={5}
            maxLength={MAX_FEEDBACK_LENGTH}
            disabled={sending}
            placeholder={t("What happened, or what would you like?")}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={[ids.count, fieldErrors.description ? `${ids.description}-error` : null].filter(Boolean).join(" ")}
            onChange={(event) => {
              setDescription(event.target.value);
              if (fieldErrors.description) setFieldErrors(({ description: _description, ...rest }) => rest);
            }}
          />
          <div className="feedback__text-foot">
            {fieldErrors.description ? (
              <p className="field__error" id={`${ids.description}-error`} role="alert">
                {fieldErrors.description}
              </p>
            ) : (
              <span />
            )}
            <span className="feedback__count" id={ids.count}>
              {t("{count} of {max} characters", { count: description.length, max: MAX_FEEDBACK_LENGTH })}
            </span>
          </div>
        </div>

        {error && (
          <p className="feedback__error" role="alert">
            {error}
          </p>
        )}

        <div className="feedback__actions">
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" icon="send" disabled={!canSend}>
            {sending ? t("Sending…") : t("Send feedback")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
