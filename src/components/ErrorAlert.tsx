import { CircleAlert } from "lucide-react";
import type { ErrorDetails } from "../api";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";

/** A failure message, plus DeployHQ's suggestion on how to fix it when there is one. */
export function ErrorAlert({ error }: { error: ErrorDetails }) {
  return (
    <div className="error-alert" role="alert">
      <CircleAlert
        className="error-alert-icon"
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE_WIDTH}
        aria-hidden
      />
      <div className="error-alert-text">
        <p className="error-alert-message">{error.message}</p>
        {error.hint && <p className="error-alert-hint">{error.hint}</p>}
      </div>
    </div>
  );
}
