import { Bell, ChevronRight } from "lucide-react";
import { formatRelativeTime } from "../formatters";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import type { Project } from "../types";

interface ProjectRowProps {
  project: Project;
  isWatched: boolean;
  onToggleWatched: () => void;
  onSelect: () => void;
}

export function ProjectRow({ project, isWatched, onToggleWatched, onSelect }: ProjectRowProps) {
  const watchLabel = isWatched ? "Stop watching deployments" : "Watch deployments";

  return (
    <li className="project-row">
      <button
        className={`icon-button watch-button${isWatched ? " is-watched" : ""}`}
        onClick={onToggleWatched}
        aria-pressed={isWatched}
        aria-label={watchLabel}
        title={watchLabel}
      >
        <Bell
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE_WIDTH}
          fill={isWatched ? "currentColor" : "none"}
          aria-hidden
        />
      </button>
      <button className="list-row" onClick={onSelect} data-nav-item>
        <span className="list-row-main">
          <span className="list-row-title">{project.name}</span>
          <span className="list-row-subtitle">
            {project.last_deployed_at
              ? `Deployed ${formatRelativeTime(project.last_deployed_at)}`
              : "Never deployed"}
          </span>
        </span>
        <ChevronRight
          className="chevron"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE_WIDTH}
          aria-hidden
        />
      </button>
    </li>
  );
}
