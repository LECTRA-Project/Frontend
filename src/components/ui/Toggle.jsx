/*
  Toggle — an on/off switch (used on the Account settings page).
  `label` is read by screen readers; the visible label sits next to the switch.
*/
export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}
