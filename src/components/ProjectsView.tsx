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
import { RecentDeployments } from "./RecentDeployments";
import { RunningDeployments } from "./RunningDeployments";
import { UpdateBanner } from "./UpdateBanner";
import { useCachedResource } from "../useCachedResource";
import { ScrollArea } from "./ScrollArea";

export type HomeTab = "projects" | "recent";

const HOME_TABS: { tab: HomeTab; label: string }[] = [
  { tab: "projects", label: "Projects" },
  { tab: "recent", label: "Recent" },
];

interface ProjectsViewProps {
  tab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  onSelectProject: (project: Project) => void;
  onSelectDeployment: (watched: WatchedDeployment) => void;
  onOpenSettings: () => void;
}

export function ProjectsView({
  tab,
  onTabChange,
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
    if (event.key === "1" || event.key === "2") {
      event.preventDefault();
      onTabChange(event.key === "1" ? "projects" : "recent");
    } else if (event.key === "r" && tab === "projects") {
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
          placeholder={tab === "projects" ? "Search projects" : "Search deployments"}
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
        {/* Recent deployments come from the background poller, which keeps them current. */}
        {tab === "projects" && (
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
        )}
        <button
          className="icon-button"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
      </header>

      <div className="segmented-control" role="tablist">
        {HOME_TABS.map(({ tab: tabOption, label }, index) => (
          <button
            key={tabOption}
            className="segmented-control-option"
            role="tab"
            aria-selected={tab === tabOption}
            title={`${label} (⌘${index + 1})`}
            onClick={() => onTabChange(tabOption)}
          >
            {label}
          </button>
        ))}
      </div>

      <ScrollArea>
        <UpdateBanner />
        {tab === "recent" ? (
          <RecentDeployments
            searchQuery={searchQuery}
            hasWatchedProjects={watchedPermalinks.size > 0}
            onSelectDeployment={onSelectDeployment}
          />
        ) : (
          <>
            {error && <ErrorAlert error={error} />}
            {!projects && !error && (
              <p className="empty-message">
                <Spinner />
              </p>
            )}
            {projects && visibleProjects.length === 0 && (
              <p className="empty-message">No projects found</p>
            )}
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
          </>
        )}
      </ScrollArea>
    </div>
  );
}
