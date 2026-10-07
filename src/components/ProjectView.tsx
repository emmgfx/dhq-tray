import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  listDeployTargets,
  listRecentDeployments,
  listTrackedDeployments,
  onDeploymentUpdated,
} from "../api";
import { deploymentTargetsTarget, toDeployTargets } from "../deployTargets";
import { isDeploymentInProgress } from "../deploymentStatus";
import type { DeployTarget, Deployment, Project } from "../types";
import { DeployTargetRow } from "./DeployTargetRow";
import { useCachedResource } from "../useCachedResource";
import { ScrollArea } from "./ScrollArea";
import { Spinner } from "./Spinner";
import { useArrowKeyNavigation } from "../hooks/useArrowKeyNavigation";
import { useKeyDown } from "../hooks/useKeyDown";
import { ChevronLeft, ExternalLink, RefreshCw } from "lucide-react";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";

interface ProjectViewProps {
  account: string;
  project: Project;
  onBack: () => void;
  onDeployTarget: (target: DeployTarget, branch: string) => void;
}

export function ProjectView({ account, project, onBack, onDeployTarget }: ProjectViewProps) {
  const fetchTargets = useCallback(() => listDeployTargets(project.permalink), [project.permalink]);
  const {
    data: rawTargets,
    error,
    isRefreshing: isRefreshingTargets,
    refresh: refreshTargets,
  } = useCachedResource(`deploy-targets:${project.permalink}`, fetchTargets);
  const targets = useMemo(() => rawTargets && toDeployTargets(rawTargets), [rawTargets]);

  const fetchRecentDeployments = useCallback(
    () => listRecentDeployments(project.permalink),
    [project.permalink],
  );
  const {
    data: recentDeployments,
    isRefreshing: isRefreshingDeployments,
    refresh: refreshRecentDeployments,
  } = useCachedResource(`recent-deployments:${project.permalink}`, fetchRecentDeployments);

  const screenRef = useRef<HTMLDivElement>(null);
  useArrowKeyNavigation(screenRef);
  useKeyDown((event) => {
    if (event.metaKey && event.key === "r") {
      event.preventDefault();
      refresh();
    }
  });

  const isRefreshing = isRefreshingTargets || isRefreshingDeployments;
  const refresh = () => {
    refreshTargets();
    refreshRecentDeployments();
  };

  // Live updates from the watcher, oldest first; they win over the fetched list.
  const [liveDeploymentsById, setLiveDeploymentsById] = useState<Record<string, Deployment>>({});

  // Deployments already being tracked (e.g. just started) are known before the
  // recent deployments list refreshes, so their targets are disabled right away.
  useEffect(() => {
    listTrackedDeployments().then((tracked) =>
      setLiveDeploymentsById((current) => {
        const known = { ...current };
        for (const { project: projectPermalink, deployment } of tracked) {
          if (projectPermalink === project.permalink && !known[deployment.identifier]) {
            known[deployment.identifier] = deployment;
          }
        }
        return known;
      }),
    );
  }, [project.permalink]);

  useEffect(() => {
    const unlistenPromise = onDeploymentUpdated(({ project: projectPermalink, deployment }) => {
      if (projectPermalink !== project.permalink) return;
      setLiveDeploymentsById((current) => {
        const { [deployment.identifier]: _previous, ...others } = current;
        return { ...others, [deployment.identifier]: deployment };
      });
      if (deployment.status === "completed") {
        refreshTargets();
        refreshRecentDeployments();
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [project.permalink, refreshTargets, refreshRecentDeployments]);

  /** Deployment to show on the row: a live one, or one still running per the API. */
  const visibleDeploymentFor = (target: DeployTarget) => {
    const live = Object.values(liveDeploymentsById).filter((deployment) =>
      deploymentTargetsTarget(deployment, target),
    );
    if (live.length > 0) return live[live.length - 1];
    return recentDeployments?.find(
      (deployment) =>
        isDeploymentInProgress(deployment) && deploymentTargetsTarget(deployment, target),
    );
  };

  const lastDeployedAtFor = (target: DeployTarget) => {
    const lastCompleted = recentDeployments?.find(
      (deployment) =>
        deployment.status === "completed" && deploymentTargetsTarget(deployment, target),
    );
    return lastCompleted?.timestamps.completed_at ?? null;
  };

  const defaultBranch = project.repository?.branch ?? null;

  const [groupTargets, serverTargets] = useMemo(
    () => [
      targets?.filter((target) => target.kind === "group") ?? [],
      targets?.filter((target) => target.kind === "server") ?? [],
    ],
    [targets],
  );

  const renderTargets = (sectionTargets: DeployTarget[]) =>
    sectionTargets.map((target) => {
      const branch = target.branch || defaultBranch;
      const deployment = visibleDeploymentFor(target);
      return (
        <DeployTargetRow
          key={target.identifier}
          target={target}
          branch={branch}
          lastDeployedAt={lastDeployedAtFor(target)}
          deployment={deployment}
          isDeploying={deployment !== undefined && isDeploymentInProgress(deployment)}
          onDeploy={() => branch && onDeployTarget(target, branch)}
        />
      );
    });

  return (
    <div className="screen" ref={screenRef}>
      <header className="toolbar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
        <h1 className="toolbar-title">{project.name}</h1>
        <button
          className="icon-button"
          onClick={refresh}
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
          onClick={() => openUrl(`https://${account}.deployhq.com/projects/${project.permalink}`)}
          aria-label="Open in DeployHQ"
          title="Open in DeployHQ"
        >
          <ExternalLink size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
      </header>

      <ScrollArea>
        {error && <p className="error-message">{error}</p>}
        {!targets && !error && (
          <p className="empty-message">
            <Spinner />
          </p>
        )}
        {targets && targets.length === 0 && (
          <p className="empty-message">This project has no servers</p>
        )}
        {groupTargets.length > 0 && (
          <section>
            <h2 className="section-title">Server groups</h2>
            <ul className="grouped-list target-list">{renderTargets(groupTargets)}</ul>
          </section>
        )}
        {serverTargets.length > 0 && (
          <section>
            <h2 className="section-title">Servers</h2>
            <ul className="grouped-list target-list">{renderTargets(serverTargets)}</ul>
          </section>
        )}
      </ScrollArea>
    </div>
  );
}
