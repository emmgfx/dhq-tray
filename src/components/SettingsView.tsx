import { useEffect, useState, type FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ChevronLeft } from "lucide-react";
import {
  clearCredentials,
  type ErrorDetails,
  getNotificationPermission,
  getPreferences,
  openNotificationSettings,
  quitApp,
  saveCredentials,
  sendTestNotification,
  setPreferences,
  toErrorDetails,
} from "../api";
import { ErrorAlert } from "./ErrorAlert";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import type {
  NotificationLevel,
  NotificationPermission,
  Preferences,
  SettingsSummary,
} from "../types";
import { ScrollArea } from "./ScrollArea";
import { useAppUpdate } from "../appUpdate";
import { Switch } from "./Switch";

interface SettingsViewProps {
  settings: SettingsSummary | null;
  onSaved: () => void;
  onCancel?: () => void;
}

const NOTIFICATION_LEVEL_LABELS: Record<NotificationLevel, string> = {
  all: "All deployments",
  failures_only: "Only failures",
  off: "Off",
};

export function SettingsView({ settings, onSaved, onCancel }: SettingsViewProps) {
  const [account, setAccount] = useState(settings?.account ?? "");
  const [email, setEmail] = useState(settings?.email ?? "");
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  const [preferences, setPreferencesState] = useState<Preferences | null>(null);
  const [opensAtLogin, setOpensAtLogin] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const { state: updateState, checkForUpdates, installUpdate } = useAppUpdate();
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | null>(null);

  useEffect(() => {
    getPreferences().then(setPreferencesState);
    isEnabled()
      .then(setOpensAtLogin)
      .catch(() => setOpensAtLogin(false));
    getVersion().then(setAppVersion);
    getNotificationPermission().then(setNotificationPermission);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await saveCredentials(account, email, apiKey);
      onSaved();
    } catch (saveError) {
      setError(toErrorDetails(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await clearCredentials();
      onSaved();
    } catch (clearError) {
      setError(toErrorDetails(clearError));
    }
  };

  const updatePreferences = async (changes: Partial<Preferences>) => {
    if (!preferences) return;
    const updated = { ...preferences, ...changes };
    setPreferencesState(updated);
    try {
      await setPreferences(updated);
    } catch (saveError) {
      setPreferencesState(preferences);
      setError(toErrorDetails(saveError));
    }
  };

  const toggleOpenAtLogin = async (shouldOpen: boolean) => {
    try {
      await (shouldOpen ? enable() : disable());
      setOpensAtLogin(await isEnabled());
    } catch (toggleError) {
      setError(toErrorDetails(toggleError));
    }
  };

  return (
    <div className="screen">
      <header className="toolbar">
        {onCancel && (
          <button className="icon-button" onClick={onCancel} aria-label="Back">
            <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
          </button>
        )}
        <h1 className="toolbar-title">Settings</h1>
      </header>

      <ScrollArea>
        {error && <ErrorAlert error={error} />}

        <section>
          <h2 className="section-title">DeployHQ account</h2>
          <form onSubmit={handleSubmit}>
            <ul className="grouped-list settings-list">
              <li>
                <label className="settings-row">
                  <span>Account</span>
                  <span className="settings-row-input">
                    <input
                      value={account}
                      onChange={(event) => setAccount(event.target.value)}
                      placeholder="mycompany"
                      required
                      autoFocus={!settings}
                    />
                    <span className="input-suffix">.deployhq.com</span>
                  </span>
                </label>
              </li>
              <li>
                <label className="settings-row">
                  <span>Email</span>
                  <span className="settings-row-input">
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      required
                    />
                  </span>
                </label>
              </li>
              <li>
                <label className="settings-row">
                  <span>API key</span>
                  <span className="settings-row-input">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={settings ? "Unchanged" : "Required"}
                      required={!settings}
                    />
                  </span>
                </label>
              </li>
            </ul>
            <p className="settings-note">
              Find your API key in DeployHQ under Settings → Security. It needs write access (not
              read-only) to start deployments. Stored in the macOS Keychain.
            </p>
            <div className="form-actions settings-actions">
              <button
                type="submit"
                className="button button-primary button-small"
                disabled={isSaving}
              >
                {isSaving ? "Checking…" : "Save"}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="section-title">General</h2>
          <ul className="grouped-list settings-list">
            <li className="settings-row">
              <span>Open at login</span>
              <Switch
                checked={opensAtLogin ?? false}
                disabled={opensAtLogin === null}
                onChange={(event) => toggleOpenAtLogin(event.target.checked)}
                aria-label="Open at login"
              />
            </li>
          </ul>
        </section>

        {preferences && (
          <section>
            <h2 className="section-title">Notifications</h2>
            <ul className="grouped-list settings-list">
              <li className="settings-row">
                <span>Notify me about</span>
                <select
                  value={preferences.notification_level}
                  onChange={(event) =>
                    updatePreferences({
                      notification_level: event.target.value as NotificationLevel,
                    })
                  }
                  aria-label="Notify me about"
                >
                  {(Object.keys(NOTIFICATION_LEVEL_LABELS) as NotificationLevel[]).map((level) => (
                    <option key={level} value={level}>
                      {NOTIFICATION_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </li>
              <li className="settings-row">
                <span>Play sound</span>
                <Switch
                  checked={preferences.notification_sound}
                  disabled={preferences.notification_level === "off"}
                  onChange={(event) =>
                    updatePreferences({ notification_sound: event.target.checked })
                  }
                  aria-label="Play sound"
                />
              </li>
              <li className="settings-row">
                <span>Test notification</span>
                <button
                  className="button button-secondary button-small"
                  onClick={sendTestNotification}
                >
                  Send
                </button>
              </li>
            </ul>
            {notificationPermission === "denied" && (
              <p className="settings-note">
                Notifications are turned off for DHQ Tray in System Settings.{" "}
                <button className="link-button" onClick={openNotificationSettings}>
                  Open Notification Settings
                </button>
              </p>
            )}
          </section>
        )}

        <section>
          <h2 className="section-title">Updates</h2>
          <ul className="grouped-list settings-list">
            <li className="settings-row">
              <span>
                {updateState.status === "available" || updateState.status === "installing"
                  ? `Version ${updateState.update.version} is available`
                  : updateState.status === "up_to_date"
                    ? "DHQ Tray is up to date"
                    : updateState.status === "checking"
                      ? "Checking for updates…"
                      : `Version ${appVersion}`}
              </span>
              {updateState.status === "available" || updateState.status === "installing" ? (
                <button
                  className="button button-primary button-small"
                  onClick={installUpdate}
                  disabled={updateState.status === "installing"}
                >
                  {updateState.status === "installing" ? "Installing…" : "Install and restart"}
                </button>
              ) : (
                <button
                  className="button button-secondary button-small"
                  onClick={checkForUpdates}
                  disabled={updateState.status === "checking"}
                >
                  Check for updates
                </button>
              )}
            </li>
          </ul>
          {updateState.status === "error" && (
            <p className="settings-note">Could not check for updates: {updateState.message}</p>
          )}
        </section>

        {settings && (
          <section>
            <ul className="grouped-list settings-list sign-out-list">
              <li>
                <button className="settings-row destructive-row" onClick={handleSignOut}>
                  Sign out of {settings.account}
                </button>
              </li>
            </ul>
          </section>
        )}

        <footer className="settings-footer">
          <span>DHQ Tray {appVersion && `v${appVersion}`}</span>
          <button className="button button-secondary button-small" onClick={quitApp}>
            Quit DHQ Tray
          </button>
        </footer>
      </ScrollArea>
    </div>
  );
}
