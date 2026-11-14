import { getIn, useFormikContext } from "formik";

import Icon from "./Icon.jsx";
import { useI18n } from "../../i18n/i18n.js";
import { passwordRequirements } from "../../features/auth/validationSchemas.js";

export default function PasswordRequirements({ name }) {
  const { t } = useI18n();
  const { values } = useFormikContext();
  const password = getIn(values, name) ?? "";

  if (!password) return null;

  return (
    <ul className="password-requirements" aria-label={t("Password requirements")}>
      {passwordRequirements.map((requirement) => {
        const isMet = requirement.validate(password);
        return (
          <li
            key={requirement.key}
            className={`password-requirements__item ${isMet ? "password-requirements__item--met" : ""}`}
            aria-label={isMet ? t("{requirement}: met", { requirement: requirement.label }) : t("{requirement}: not met", { requirement: requirement.label })}
          >
            <Icon
              name={isMet ? "check" : "close"}
              size={14}
              strokeWidth={2}
              className="password-requirements__icon"
            />
            {requirement.label}
          </li>
        );
      })}
    </ul>
  );
}
