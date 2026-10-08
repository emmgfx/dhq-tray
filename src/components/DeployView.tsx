import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { type ErrorDetails, listRecentCommits, toErrorDetails, triggerDeployment } from "../api";
import { ErrorAlert } from "./ErrorAlert";
import { formatRelativeTime, shortRevision } from "../formatters";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
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

/** Commits newer than `deployedRevision`; all of them if it is not in the list. */
function pendingCommits(commits: Commit[], deployedRevision: string | null) {
  const deployedIndex = deployedRevision
    ? commits.findIndex((commit) => commit.ref === deployedRevision)
    : -1;
  return {
    commits: deployedIndex === -1 ? commits : commits.slice(0, deployedIndex),
    // The deployed revision is older than the commits the API returns.
    isTruncated: Boolean(deployedRevision) && deployedIndex === -1,
  };
}

export function DeployView({ project, target, branch, onBack, onDeployed }: DeployViewProps) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [isSyncedWithRemote, setIsSyncedWithRemote] = useState(true);
  const [commitsError, setCommitsError] = useState<ErrorDetails | null>(null);
  const [options, setOptions] = useState<DeployOptions>(DEFAULT_DEPLOY_OPTIONS);
  // Without a start revision DeployHQ uploads every file, not just the changes.
  const [deployAllFiles, setDeployAllFiles] = useState(!target.lastRevision);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deployError, setDeployError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    listRecentCommits(project.permalink, branch)
      .then((recent) => {
        setCommits(recent.commits);
        setIsSyncedWithRemote(recent.is_synced_with_remote);
      })
      .catch((error) => setCommitsError(toErrorDetails(error)));
  }, [project.permalink, branch]);

  const latestRevision = commits?.[0]?.ref ?? null;
  const pending = commits ? pendingCommits(commits, target.lastRevision) : null;

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
          <h2 className="section-title">
            Changes
            {pending &&
              !deployAllFiles &&
              ` (${pending.commits.length}${pending.isTruncated ? "+" : ""})`}
          </h2>
          {commitsError && <ErrorAlert error={commitsError} />}
          {commits && !isSyncedWithRemote && (
            <p className="settings-note">
              DeployHQ could not refresh the repository right now, so the newest commits may be
              missing. The deployment uses the latest revision shown here.
            </p>
          )}
          {!commits && !commitsError && (
            <p className="empty-message">
              <Spinner />
            </p>
          )}
          {deployAllFiles && (
            <p className="settings-note">
              Full deployment: every file in {branch} is uploaded, not only the changes since the
              last deployment.
            </p>
          )}
          {pending && !deployAllFiles && pending.commits.length === 0 && (
            <p className="settings-note">No new commits. This redeploys the current revision.</p>
          )}
          {pending && !deployAllFiles && pending.commits.length > 0 && (
            <ul className="grouped-list commit-list">
              {pending.commits.map((commit) => (
                <li key={commit.ref} className="commit-row">
                  <span className="list-row-main">
                    <span className="list-row-title">{commit.short_message || commit.ref}</span>
                    <span className="list-row-subtitle">
                      <span className="monospace">{shortRevision(commit.ref)}</span> ·{" "}
                      {commit.author}
                      {commit.timestamp && ` · ${formatRelativeTime(commit.timestamp)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
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
          disabled={isSubmitting || (!commits && !commitsError)}
        >
          {isSubmitting ? "Starting…" : `Deploy ${branch} to ${target.name}`}
        </button>
      </footer>
    </div>
  );
}
