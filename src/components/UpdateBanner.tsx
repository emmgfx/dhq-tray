import { useAppUpdate } from "../appUpdate";
import { parseReleaseNotes } from "../releaseNotes";

interface UpdateBannerProps {
  /** Settings lists what changed in the new version. */
  onShowReleaseNotes: () => void;
}

/** Shown on the main screen while a newer version is available. */
export function UpdateBanner({ onShowReleaseNotes }: UpdateBannerProps) {
  const { state, installUpdate } = useAppUpdate();
  if (state.status !== "available" && state.status !== "installing") return null;
  const hasReleaseNotes = parseReleaseNotes(state.update.body).length > 0;

  return (
    <div className="update-banner">
      <span>
        DHQ Tray {state.update.version} is available
        {hasReleaseNotes && (
          <>
            {" "}
            <button className="link-button" onClick={onShowReleaseNotes}>
              What's new
            </button>
          </>
        )}
      </span>
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
