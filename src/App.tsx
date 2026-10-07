import { useEffect, useState } from "react";
import { errorMessage, getSettings, hideWindow, onOpenDeployment, quitApp } from "./api";
import { useKeyDown } from "./hooks/useKeyDown";
import { navigateWithTransition, type NavigationDirection } from "./navigationTransition";
import type { DeployTarget, Project, SettingsSummary, WatchedDeployment } from "./types";
import { SettingsView } from "./components/SettingsView";
import { ProjectsView } from "./components/ProjectsView";
import { ProjectView } from "./components/ProjectView";
import { DeployView } from "./components/DeployView";
import { DeploymentView } from "./components/DeploymentView";

type Route =
  | { name: "projects" }
  | { name: "project"; project: Project }
  | { name: "deploy"; project: Project; target: DeployTarget; branch: string }
  | { name: "deployment"; watched: WatchedDeployment }
  | { name: "settings" };

export default function App() {
  // `undefined` while loading, `null` when no credentials are stored.
  const [settings, setSettings] = useState<SettingsSummary | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>({ name: "projects" });
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const navigate = (direction: NavigationDirection, nextRoute: Route) =>
    navigateWithTransition(direction, () => setRoute(nextRoute));

  /** Where Esc goes from each screen; `null` closes the panel. */
  const previousRoute = (): Route | null => {
    if (!settings) return null;
    switch (route.name) {
      case "deploy":
        return { name: "project", project: route.project };
      case "project":
      case "deployment":
      case "settings":
        return { name: "projects" };
      case "projects":
        return null;
    }
  };

  // App-wide shortcuts; screens add their own (⌘R, ⌘F, arrows).
  useKeyDown((event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      const target = previousRoute();
      if (target) navigate("back", target);
      else hideWindow();
      return;
    }
    if (!event.metaKey) return;
    if (event.key === "q") {
      event.preventDefault();
      quitApp();
    } else if (event.key === "w") {
      event.preventDefault();
      hideWindow();
    } else if (event.key === "," && settings && route.name !== "settings") {
      event.preventDefault();
      navigate("forward", { name: "settings" });
    }
  });

  const reloadSettings = async () => {
    let current: SettingsSummary | null;
    try {
      current = await getSettings();
    } catch (error) {
      // Credentials may exist but be unreadable (e.g. Keychain access denied);
      // never show the empty setup form in that case.
      setSettingsError(errorMessage(error));
      return;
    }
    setSettingsError(null);
    setSettings(current);
    // Without credentials the settings screen is shown regardless of the route.
    setRoute({ name: "projects" });
  };

  useEffect(() => {
    reloadSettings();
  }, []);

  // A notification was clicked: Rust opened the panel, show that deployment.
  useEffect(() => {
    const unlistenPromise = onOpenDeployment((watched) =>
      navigate("forward", { name: "deployment", watched }),
    );
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  if (settingsError) {
    return (
      <div className="screen centered-message">
        <p className="error-message">Could not read your DeployHQ credentials.</p>
        <p className="empty-message">{settingsError}</p>
        <button className="button button-primary" onClick={reloadSettings}>
          Try again
        </button>
      </div>
    );
  }

  if (settings === undefined) return null;

  if (!settings || route.name === "settings") {
    return (
      <SettingsView
        settings={settings}
        onSaved={reloadSettings}
        onCancel={settings ? () => navigate("back", { name: "projects" }) : undefined}
      />
    );
  }

  if (route.name === "deploy") {
    return (
      <DeployView
        project={route.project}
        target={route.target}
        branch={route.branch}
        onBack={() => navigate("back", { name: "project", project: route.project })}
        // Back to the root, where the new deployment shows under "Running deployments".
        onDeployed={() => navigate("back", { name: "projects" })}
      />
    );
  }

  if (route.name === "deployment") {
    return (
      <DeploymentView
        // A new deployment (e.g. after a retry) starts with fresh state.
        key={route.watched.deployment.identifier}
        account={settings.account}
        watched={route.watched}
        onBack={() => navigate("back", { name: "projects" })}
        onShowDeployment={(watched) => navigate("forward", { name: "deployment", watched })}
      />
    );
  }

  if (route.name === "project") {
    return (
      <ProjectView
        account={settings.account}
        project={route.project}
        onBack={() => navigate("back", { name: "projects" })}
        onDeployTarget={(target, branch) =>
          navigate("forward", { name: "deploy", project: route.project, target, branch })
        }
      />
    );
  }

  return (
    <ProjectsView
      onSelectProject={(project) => navigate("forward", { name: "project", project })}
      onSelectDeployment={(watched) => navigate("forward", { name: "deployment", watched })}
      onOpenSettings={() => navigate("forward", { name: "settings" })}
    />
  );
}
