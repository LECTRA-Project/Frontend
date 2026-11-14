import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import PageShell from "../../components/PageShell.jsx";
import Button from "../../components/ui/Button.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import { LANGUAGES, useI18n } from "../../i18n/i18n.js";
import ApiKeysSection from "./ApiKeysSection.jsx";
import "./profile.css";

/*
  Account settings — interface language, notifications, privacy and the student's own AI
  provider API keys.

  - Interface language: applies at once and is saved for this user in this browser
    (see I18nProvider), so it is restored on the next visit.
  - API keys: saved on the server (see ApiKeysSection).
  - DEMO MODE: notifications and privacy only change local state; "Save settings" saves
    nothing for them.
*/
export default function AccountSettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const [settings, setSettings] = useState({
    studyReminders: true,
    productUpdates: false,
    showStatistics: false,
  });
  const [saved, setSaved] = useState(false);

  // Opened from the chat's model dialog (/settings#api-keys): go to the API keys.
  useEffect(() => {
    if (location.hash !== "#api-keys") return;
    const heading = document.getElementById("api-keys");
    heading?.scrollIntoView?.({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [location.hash]);

  function update(key, value) {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  }

  return (
    <PageShell title={t("Account settings")} subtitle={t("Manage preferences for your account.")}>
      <section className="card settings" aria-label={t("Settings")}>
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

        <h2 className="settings__group">{t("Notifications")}</h2>
        <SettingRow
          label={t("Study reminders")}
          help={t("Email reminders for planned study sessions.")}
          checked={settings.studyReminders}
          onChange={(value) => update("studyReminders", value)}
        />
        <SettingRow
          label={t("Product updates")}
          help={t("Occasional news about new LECTRA features.")}
          checked={settings.productUpdates}
          onChange={(value) => update("productUpdates", value)}
        />

        <h2 className="settings__group">{t("Privacy")}</h2>
        <SettingRow
          label={t("Show statistics on my profile")}
          help={t("Only you can see your statistics by default.")}
          checked={settings.showStatistics}
          onChange={(value) => update("showStatistics", value)}
        />

        <ApiKeysSection />
      </section>

      <div className="page-actions">
        {saved && (
          <TransientStatus onDismiss={() => setSaved(false)}>
            <p className="notice notice--accent" role="status">
              {t("Demo mode — settings are not saved yet.")}
            </p>
          </TransientStatus>
        )}
        <Button variant="primary" onClick={() => setSaved(true)}>
          {t("Save settings")}
        </Button>
      </div>
    </PageShell>
  );
}

function SettingRow({ label, help, checked, onChange }) {
  return (
    <div className="settings__row">
      <div>
        <p className="settings__label">{label}</p>
        <p className="settings__help">{help}</p>
      </div>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
