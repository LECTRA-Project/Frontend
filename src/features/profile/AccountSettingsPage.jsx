import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import PageShell from "../../components/PageShell.jsx";
import { LANGUAGES, useI18n } from "../../i18n/i18n.js";
import { useTheme } from "../../theme/theme.js";
import ApiKeysSection from "./ApiKeysSection.jsx";
import "./profile.css";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/*
  Account settings — theme, interface language and the student's own AI provider API keys.
  Every setting applies (and is saved) as soon as it is changed, so there is no Save button.

  - Theme: System (follows the operating system), Light or Dark. Applies at once and is
    saved in this browser (see src/theme/), so the sign-in page uses it too.
  - Interface language: applies at once and is saved for this user in this browser
    (see I18nProvider), so it is restored on the next visit.
  - API keys: saved on the server (see ApiKeysSection).
*/
export default function AccountSettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  // Opened from the chat's model dialog (/settings#api-keys): go to the API keys.
  useEffect(() => {
    if (location.hash !== "#api-keys") return;
    const heading = document.getElementById("api-keys");
    heading?.scrollIntoView?.({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [location.hash]);

  return (
    <PageShell title={t("Account settings")} subtitle={t("Manage preferences for your account.")}>
      <section className="card settings" aria-label={t("Settings")}>
        <h2 className="settings__group">{t("Appearance")}</h2>
        <div className="settings__row">
          <div>
            <label className="settings__label" htmlFor="theme">
              {t("Theme")}
            </label>
            <p className="settings__help">{t("Light, dark, or the same as your device.")}</p>
          </div>
          <select id="theme" className="settings__select" value={theme} onChange={(event) => setTheme(event.target.value)}>
            {THEME_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.label)}
              </option>
            ))}
          </select>
        </div>

        <h2 className="settings__group">{t("Language & region")}</h2>
        <div className="settings__row">
          <div>
            <label className="settings__label" htmlFor="language">
              {t("Interface language")}
            </label>
            <p className="settings__help">{t("Language used across the workspace.")}</p>
          </div>
          <select
            id="language"
            className="settings__select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {LANGUAGES.map((item) => (
              <option key={item.code} value={item.code} lang={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <ApiKeysSection />
      </section>
    </PageShell>
  );
}
