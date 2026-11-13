import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { type ErrorDetails, listRecentCommits, toErrorDetails, triggerDeployment } from "../api";
import { ErrorAlert } from "./ErrorAlert";
import { formatRelativeTime, shortRevision } from "../formatters";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import { describeCommit, pendingCommits, summarizeAuthors } from "../pendingChanges";
import type { Commit, DeployOptions, DeployTarget, Deployment, Project } from "../types";
import { ScrollArea } from "./ScrollArea";
import { Switch } from "./Switch";
import { Spinner } from "./Spinner";

interface DeployViewProps {
  project: Project;
  target: DeployTarget;
  branch: string;
  onBack: () => void;
  onDeployed: (deployment: Deployment) => void;
}

// Preselected like DeployHQ's own deploy form; adjustable per deployment.
const DEFAULT_DEPLOY_OPTIONS: DeployOptions = {
  copy_config_files: true,
  run_build_commands: true,
  use_build_cache: true,
};

const DEPLOY_OPTION_LABELS: Record<keyof DeployOptions, string> = {
  copy_config_files: "Copy config files",
  run_build_commands: "Run build commands",
  use_build_cache: "Use build cache",
};

/** Commits listed before "Show more"; long lists bury the options. */
const COLLAPSED_COMMIT_COUNT = 8;
/** Hiding fewer than this many commits is not worth the extra click. */
const MIN_HIDDEN_COMMIT_COUNT = 3;

/** Whether the commits shown include those DeployHQ fetches from the remote. */
type RemoteSync = "syncing" | "synced" | "failed";

export function DeployView({ project, target, branch, onBack, onDeployed }: DeployViewProps) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [remoteSync, setRemoteSync] = useState<RemoteSync>("syncing");
  const [commitsError, setCommitsError] = useState<ErrorDetails | null>(null);
  const [showAllCommits, setShowAllCommits] = useState(false);
  const [options, setOptions] = useState<DeployOptions>(DEFAULT_DEPLOY_OPTIONS);
  // Without a start revision DeployHQ uploads every file, not just the changes.
  const [deployAllFiles, setDeployAllFiles] = useState(!target.lastRevision);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deployError, setDeployError] = useState<ErrorDetails | null>(null);

  // Fetching from the remote can take long, so the commits DeployHQ already has
  // are shown first. The fetch starts after that read: running both at once can
  // make DeployHQ answer the quick one as busy while it updates the repository.
  useEffect(() => {
    let isCurrent = true;
    const loadCommits = async () => {
      try {
        const known = await listRecentCommits(project.permalink, branch, false);
        if (isCurrent) setCommits(known);
      } catch (error) {
        if (isCurrent) setCommitsError(toErrorDetails(error));
      }
      if (!isCurrent) return;
      try {
        const fetched = await listRecentCommits(project.permalink, branch, true);
        if (!isCurrent) return;
        setCommits(fetched);
        setCommitsError(null);
        setRemoteSync("synced");
      } catch {
        if (isCurrent) setRemoteSync("failed");
      }
    };
    loadCommits();
    return () => {
      isCurrent = false;
    };
  }, [project.permalink, branch]);

  const latestRevision = commits?.[0]?.ref ?? null;
  const pending = commits ? pendingCommits(commits, target.lastRevision) : null;
  const isCollapsed =
    !showAllCommits &&
    (pending?.commits.length ?? 0) >= COLLAPSED_COMMIT_COUNT + MIN_HIDDEN_COMMIT_COUNT;
  const visibleCommits = isCollapsed
    ? (pending?.commits.slice(0, COLLAPSED_COMMIT_COUNT) ?? [])
    : (pending?.commits ?? []);
  const hiddenCommitCount = (pending?.commits.length ?? 0) - visibleCommits.length;
  const oldestPendingTimestamp = pending?.commits[pending.commits.length - 1]?.timestamp ?? null;

  const handleDeploy = async () => {
    setIsSubmitting(true);
    setDeployError(null);
    try {
      const deployment = await triggerDeployment({
        project: project.permalink,
        projectName: project.name,
        targetIdentifier: target.identifier,
        targetName: target.name,
        branch,
        startRevision: deployAllFiles ? null : target.lastRevision,
        endRevision: latestRevision,
        options,
      });
      onDeployed(deployment);
    } catch (error) {
      setDeployError(toErrorDetails(error));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="screen">
      <header className="toolbar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
        <h1 className="toolbar-title">Deploy to {target.name}</h1>
      </header>

      <ScrollArea>
        <ul className="grouped-list settings-list summary-list">
          <li className="settings-row">
            <span>Project</span>
            <span className="settings-row-value">{project.name}</span>
          </li>
          <li className="settings-row">
            <span>{target.kind === "group" ? "Server group" : "Server"}</span>
            <span className="settings-row-value">
              {target.name}
              {target.environment && ` · ${target.environment}`}
            </span>
          </li>
          <li className="settings-row">
            <span>Branch</span>
            <span className="settings-row-value">{branch}</span>
          </li>
          <li className="settings-row">
            <span>Revision</span>
            <span className="settings-row-value monospace">
              {deployAllFiles ? "all files" : shortRevision(target.lastRevision)} →{" "}
              {latestRevision ? shortRevision(latestRevision) : "latest"}
            </span>
          </li>
        </ul>

        <section>
          <h2 className="section-title section-title-with-status">
            <span>
              Changes
              {pending &&
                !deployAllFiles &&
                ` (${pending.commits.length}${pending.isTruncated ? "+" : ""})`}
            </span>
            {commits && remoteSync === "syncing" && (
              <span className="section-title-status">
                <Spinner /> Checking for new commits
              </span>
            )}
          </h2>
          {commitsError && !commits && remoteSync !== "syncing" && (
            <ErrorAlert error={commitsError} />
          )}
          {commits && remoteSync === "failed" && (
            <p className="section-note">
              DeployHQ could not fetch from the repository right now, so the newest commits may
              be missing. The deployment uses the latest revision shown here.
            </p>
          )}
          {!commits && remoteSync === "syncing" && (
            <p className="empty-message">
              <Spinner />
            </p>
          )}
          {deployAllFiles && (
            <p className="section-note">
              Full deployment: every file in {branch} is uploaded, not only the changes since the
              last deployment.
            </p>
          )}
          {pending && !deployAllFiles && pending.commits.length === 0 && (
            <p className="section-note">No new commits. This redeploys the current revision.</p>
          )}
          {pending && !deployAllFiles && pending.commits.length > 0 && (
            <>
              <p className="section-note">
                By {summarizeAuthors(pending.commits)}
                {oldestPendingTimestamp &&
                  `, the oldest ${formatRelativeTime(oldestPendingTimestamp)}`}
              </p>
              <ul className="grouped-list commit-list">
                {visibleCommits.map((commit) => {
                  const description = describeCommit(commit);
                  return (
                    <li
                      key={commit.ref}
                      className={
                        description.isBranchMerge ? "commit-row commit-row-merge" : "commit-row"
                      }
                    >
                      <span className="list-row-main">
                        <span className="list-row-title" title={description.title}>
                          {description.title}
                        </span>
                        <span className="list-row-subtitle">
                          {description.pullRequest !== null &&
                            `PR #${description.pullRequest} · `}
                          {commit.author}
                          {commit.timestamp && ` · ${formatRelativeTime(commit.timestamp)}`}
                        </span>
                      </span>
                      <span className="commit-revision monospace">
                        {shortRevision(commit.ref)}
                      </span>
                    </li>
                  );
                })}
                {hiddenCommitCount > 0 && (
                  <li>
                    <button
                      className="list-row commit-list-toggle"
                      onClick={() => setShowAllCommits(true)}
                    >
                      Show {hiddenCommitCount} more
                    </button>
                  </li>
                )}
              </ul>
            </>
          )}
          {pending?.isTruncated && !deployAllFiles && (
            <p className="settings-note">Older commits are not shown.</p>
          )}
        </section>

        <section>
          <h2 className="section-title">Options</h2>
          <ul className="grouped-list settings-list">
            <li>
              <label className="settings-row">
                <span>Deploy all files</span>
                <Switch
                  checked={deployAllFiles}
                  disabled={isSubmitting}
                  onChange={(event) => setDeployAllFiles(event.target.checked)}
                />
              </label>
            </li>
            {(Object.keys(DEPLOY_OPTION_LABELS) as (keyof DeployOptions)[]).map((option) => (
              <li key={option}>
                <label className="settings-row">
                  <span>{DEPLOY_OPTION_LABELS[option]}</span>
                  <Switch
                    checked={options[option]}
                    disabled={isSubmitting}
                    onChange={(event) =>
                      setOptions((current) => ({ ...current, [option]: event.target.checked }))
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      </ScrollArea>

      <footer className="screen-footer">
        {deployError && <ErrorAlert error={deployError} />}
        <button
          className="button button-primary button-block"
          onClick={handleDeploy}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Starting…" : `Deploy ${branch} to ${target.name}`}
        </button>
      </footer>
    </div>
  );
}
