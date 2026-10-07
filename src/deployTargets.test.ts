import { describe, expect, it } from "vitest";
import { deploymentTargetsTarget, toDeployTargets } from "./deployTargets";
import type { DeployTarget, Deployment, Server } from "./types";

const server = (overrides: Partial<Server>): Server => ({
  identifier: "srv",
  name: "Production",
  environment: "production",
  preferred_branch: null,
  branch: "main",
  last_revision: "abc",
  server_group_identifier: null,
  enabled: true,
  ...overrides,
});

describe("toDeployTargets", () => {
  it("lists groups first and skips disabled servers", () => {
    const targets = toDeployTargets({
      server_groups: [
        {
          identifier: "grp",
          name: "Web",
          environment: null,
          preferred_branch: "main",
          last_revision: null,
          servers: [server({}), server({ identifier: "srv2" })],
        },
      ],
      servers: [server({}), server({ identifier: "off", enabled: false })],
    });
    expect(targets.map((target) => [target.kind, target.identifier])).toEqual([
      ["group", "grp"],
      ["server", "srv"],
    ]);
    expect(targets[0].serverCount).toBe(2);
  });

  it("prefers the preferred branch over the current one", () => {
    const [target] = toDeployTargets({
      server_groups: [],
      servers: [server({ preferred_branch: "release", branch: "main" })],
    });
    expect(target.branch).toBe("release");
  });
});

describe("deploymentTargetsTarget", () => {
  const deployment = {
    servers: [{ identifier: "srv", name: "Production", server_group_identifier: "grp" }],
  } as Deployment;
  const target = (kind: DeployTarget["kind"], identifier: string): DeployTarget => ({
    identifier,
    name: identifier,
    kind,
    environment: null,
    branch: null,
    lastRevision: null,
  });

  it("matches servers by identifier and groups by membership", () => {
    expect(deploymentTargetsTarget(deployment, target("server", "srv"))).toBe(true);
    expect(deploymentTargetsTarget(deployment, target("group", "grp"))).toBe(true);
    expect(deploymentTargetsTarget(deployment, target("server", "other"))).toBe(false);
  });
});
