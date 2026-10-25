import Icon from "./Icon.jsx";

/*
  Button
  variant: "primary" (green), "secondary" (white with border) or "ghost" (no border)
  icon:    optional icon name shown before the label (see Icon.jsx)
  Any other props (onClick, type, disabled, aria-*) are passed to the <button>.
*/
export default function Button({
  variant = "secondary",
  size,
  icon,
  fullWidth = false,
  active = false,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size === "sm" && "btn--sm",
    fullWidth && "btn--full",
    active && "btn--active",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
