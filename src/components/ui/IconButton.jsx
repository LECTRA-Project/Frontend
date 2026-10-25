import Icon from "./Icon.jsx";

/*
  IconButton — a square button that only shows an icon.
  `label` is required: screen readers read it, and it shows as a tooltip.
*/
export default function IconButton({ icon, label, outlined = false, className = "", ...rest }) {
  const classes = ["icon-btn", outlined && "icon-btn--outlined", className].filter(Boolean).join(" ");

  return (
    <button type="button" className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
