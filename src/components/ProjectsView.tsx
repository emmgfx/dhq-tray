import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ErrorDetails,
  listProjects,
  listWatchedProjects,
  setProjectWatched,
  toErrorDetails,
} from "../api";
import { ErrorAlert } from "./ErrorAlert";
import type { Project, WatchedDeployment } from "../types";
import { RefreshCw, Settings } from "lucide-react";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import { ProjectRow } from "./ProjectRow";
import { Spinner } from "./Spinner";
import { useArrowKeyNavigation } from "../hooks/useArrowKeyNavigation";
import { useKeyDown } from "../hooks/useKeyDown";
import { RunningDeployments } from "./RunningDeployments";
import { UpdateBanner } from "./UpdateBanner";
import { useCachedResource } from "../useCachedResource";
import { ScrollArea } from "./ScrollArea";

interface ProjectsViewProps {
  onSelectProject: (project: Project) => void;
  onSelectDeployment: (watched: WatchedDeployment) => void;
  onOpenSettings: () => void;
}

export function ProjectsView({
  onSelectProject,
  onSelectDeployment,
  onOpenSettings,
}: ProjectsViewProps) {
  const {
    data: projects,
    error: loadError,
    isRefreshing,
    refresh: refreshProjects,
  } = useCachedResource("projects", listProjects);
  const [toggleError, setToggleError] = useState<ErrorDetails | null>(null);
  const error = loadError ?? toggleError;
  const [searchQuery, setSearchQuery] = useState("");
  const screenRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useArrowKeyNavigation(screenRef);
  useKeyDown((event) => {
    if (!event.metaKey) return;
    if (event.key === "r") {
      event.preventDefault();
      refreshProjects();
    } else if (event.key === "f") {
      event.preventDefault();
      searchInputRef.current?.select();
    }
  });
  const [watchedPermalinks, setWatchedPermalinks] = useState<Set<string>>(new Set());

  useEffect(() => {
    listWatchedProjects().then((watched) =>
      setWatchedPermalinks(new Set(watched.map((project) => project.permalink))),
    );
  }, []);

  const toggleWatched = async (project: Project) => {
    try {
      const watched = await setProjectWatched(
        project.permalink,
        project.name,
        !watchedPermalinks.has(project.permalink),
      );
      setWatchedPermalinks(new Set(watched.map((watchedProject) => watchedProject.permalink)));
    } catch (toggleError) {
      setToggleError(toErrorDetails(toggleError));
    }
  };

  const visibleProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!projects || !query) return projects ?? [];
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.permalink.toLowerCase().includes(query),
    );
  }, [projects, searchQuery]);

  // DeployHQ favourites get their own section instead of a per-row icon,
  // so the bell is the only toggle in each row.
  const projectSections = [
    { title: "Starred", projects: visibleProjects.filter((project) => project.starred) },
    { title: "Projects", projects: visibleProjects.filter((project) => !project.starred) },
  ];

  return (
    <div className="screen" ref={screenRef}>
      <header className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search projects"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            // Esc clears the search first; the next one closes the panel.
            if (event.key === "Escape" && searchQuery) {
              event.stopPropagation();
              setSearchQuery("");
            }
          }}
          ref={searchInputRef}
          data-nav-item
          autoFocus
        />
        <button
          className="icon-button"
          onClick={refreshProjects}
          disabled={isRefreshing}
          aria-label="Refresh"
          title="Refresh"
        >
          {isRefreshing ? (
            <Spinner />
          ) : (
            <RefreshCw size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
          )}
        </button>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
      </header>

      <ScrollArea>
        {error && <ErrorAlert error={error} />}
        {!projects && !error && (
          <p className="empty-message">
            <Spinner />
          </p>
        )}
        {projects && visibleProjects.length === 0 && (
          <p className="empty-message">No projects found</p>
        )}
        <UpdateBanner />
        <RunningDeployments onSelectDeployment={onSelectDeployment} />
        {projectSections.map(
          (section) =>
            section.projects.length > 0 && (
              <section key={section.title}>
                <h2 className="section-title">{section.title}</h2>
                <ul className="grouped-list project-list">
                  {section.projects.map((project) => (
                    <ProjectRow
                      key={project.identifier}
                      project={project}
                      isWatched={watchedPermalinks.has(project.permalink)}
                      onToggleWatched={() => toggleWatched(project)}
                      onSelect={() => onSelectProject(project)}
                    />
                  ))}
                </ul>
              </section>
            ),
        )}
      </ScrollArea>
    </div>
  );
}
