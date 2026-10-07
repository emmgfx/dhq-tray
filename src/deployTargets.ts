import type { DeployTarget, DeployTargets, Deployment } from "./types";

export function toDeployTargets({ server_groups, servers }: DeployTargets): DeployTarget[] {
  return [
    ...server_groups.map((group) => ({
      identifier: group.identifier,
      name: group.name,
      kind: "group" as const,
      environment: group.environment,
      branch: group.preferred_branch,
      lastRevision: group.last_revision,
      serverCount: group.servers.length,
    })),
    ...servers
      .filter((server) => server.enabled)
      .map((server) => ({
        identifier: server.identifier,
        name: server.name,
        kind: "server" as const,
        environment: server.environment,
        branch: server.preferred_branch || server.branch,
        lastRevision: server.last_revision,
      })),
  ];
}

export function deploymentTargetsTarget(deployment: Deployment, target: DeployTarget) {
  return deployment.servers.some((server) =>
    target.kind === "group"
      ? server.server_group_identifier === target.identifier
      : server.identifier === target.identifier,
  );
}
