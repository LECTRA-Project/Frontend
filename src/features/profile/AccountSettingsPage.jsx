import { useState } from "react";

import PageShell from "../../components/PageShell.jsx";
import Button from "../../components/ui/Button.jsx";
import Toggle from "../../components/ui/Toggle.jsx";
import "./profile.css";

/*
  Account settings — interface language, notifications and privacy (as in Figma).
  DEMO MODE: the controls only change local state. "Save settings" saves nothing.
*/
export default function AccountSettingsPage() {
  const [settings, setSettings] = useState({
    language: "en",
    studyReminders: true,
    productUpdates: false,
    showStatistics: false,
  });
  const [saved, setSaved] = useState(false);

  function update(key, value) {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  }

  return (
    <PageShell title="Account settings" subtitle="Manage preferences for your account.">
      <section className="card settings" aria-label="Settings">
        <h2 className="settings__group">Language &amp; region</h2>
        <div className="settings__row">
          <div>
            <label className="settings__label" htmlFor="language">
              Interface language
            </label>
            <p className="settings__help">Language used across the workspace.</p>
          </div>
          <select
            id="language"
            className="settings__select"
            value={settings.language}
            onChange={(event) => update("language", event.target.value)}
          >
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </select>
        </div>

        <h2 className="settings__group">Notifications</h2>
        <SettingRow
          label="Study reminders"
          help="Email reminders for planned study sessions."
          checked={settings.studyReminders}
          onChange={(value) => update("studyReminders", value)}
        />
        <SettingRow
          label="Product updates"
          help="Occasional news about new LECTRA features."
          checked={settings.productUpdates}
          onChange={(value) => update("productUpdates", value)}
        />

        <h2 className="settings__group">Privacy</h2>
        <SettingRow
          label="Show statistics on my profile"
          help="Only you can see your statistics by default."
          checked={settings.showStatistics}
          onChange={(value) => update("showStatistics", value)}
        />
      </section>

      <div className="page-actions">
        {saved && (
          <p className="notice notice--accent" role="status">
            Demo mode — settings are not saved yet.
          </p>
        )}
        <Button variant="primary" onClick={() => setSaved(true)}>
          Save settings
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
