import { useAppUpdate } from "../appUpdate";

/** Shown on the main screen while a newer version is available. */
export function UpdateBanner() {
  const { state, installUpdate } = useAppUpdate();
  if (state.status !== "available" && state.status !== "installing") return null;

  return (
    <div className="update-banner">
      <span>DHQ Tray {state.update.version} is available</span>
      <button
        className="button button-primary button-small"
        onClick={installUpdate}
        disabled={state.status === "installing"}
      >
        {state.status === "installing" ? "Installing…" : "Install"}
      </button>
    </div>
  );
}
