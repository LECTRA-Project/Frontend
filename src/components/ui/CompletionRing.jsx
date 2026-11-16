import { useI18n } from "../../i18n/i18n.js";

/*
  CompletionRing — how far a lecture is, as a small ring that fills up clockwise.

    <CompletionRing percent={58} />            an 18 px ring, labelled "58% complete"
    <CompletionRing percent={58} size={44} />  bigger (e.g. a page header)

  It is an image with that label, so screen readers read "58% complete". Inside a button
  whose own label hides its content, pass `id` and point the button's aria-describedby at it.
  `decorative`: hidden from screen readers, when the percentage is written next to it.
  Renders nothing when `percent` isn't a number (an older backend without completion).
*/
const RADIUS = 15.915; // circumference 100, so the dash length is the percentage

export default function CompletionRing({ percent, size = 18, id, decorative = false, className = "" }) {
  const { t } = useI18n();
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  const label = t("{percent}% complete", { percent: value });
  return (
    <span
      id={id}
      className={["completion-ring", value === 100 && "completion-ring--done", className].filter(Boolean).join(" ")}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label, title: label })}
      style={{ width: size, height: size }}
      data-percent={value}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="completion-ring__track" cx="18" cy="18" r={RADIUS} />
        {value > 0 && (
          <circle
            className="completion-ring__value"
            cx="18"
            cy="18"
            r={RADIUS}
            pathLength="100"
            strokeDasharray={`${value} 100`}
            transform="rotate(-90 18 18)"
          />
        )}
      </svg>
    </span>
  );
}
