import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { errorMessage } from "./api";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type UpdateState =
  | { status: "idle" | "checking" | "up_to_date" }
  | { status: "available" | "installing"; update: Update }
  | { status: "error"; message: string };

interface AppUpdate {
  state: UpdateState;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdate | null>(null);

/**
 * Checks GitHub Releases for a newer version at launch and every few hours.
 * Installing is always the user's call, so a restart never interrupts them.
 */
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  const checkForUpdates = useCallback(async () => {
    setState((current) => (current.status === "installing" ? current : { status: "checking" }));
    try {
      const update = await check();
      setState(update ? { status: "available", update } : { status: "up_to_date" });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (state.status !== "available") return;
    const { update } = state;
    setState({ status: "installing", update });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [state]);

  useEffect(() => {
    checkForUpdates();
    const intervalId = window.setInterval(checkForUpdates, CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [checkForUpdates]);

  return (
    <AppUpdateContext.Provider value={{ state, checkForUpdates, installUpdate }}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate(): AppUpdate {
  const appUpdate = useContext(AppUpdateContext);
  if (!appUpdate) throw new Error("useAppUpdate must be used inside AppUpdateProvider");
  return appUpdate;
}
