import { useId, useState } from "react";
import IconButton from "./IconButton.jsx";

/*
  TextField — a labelled input.
  For type="password" it adds the eye button from the design to show or hide the text.
  `error` shows a short message under the field and marks it invalid.
*/
export default function TextField({ label, type = "text", error, className = "", ...inputProps }) {
  const id = useId();
  const errorId = `${id}-error`;
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <div className={`field ${error ? "field--invalid" : ""} ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <input
          id={id}
          type={inputType}
          className={`field__input ${isPassword ? "field__input--with-action" : ""}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {isPassword && (
          <IconButton
            className="field__action"
            icon={showPassword ? "eyeOff" : "eye"}
            label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
          />
        )}
      </div>
      {error && (
        <span id={errorId} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}
