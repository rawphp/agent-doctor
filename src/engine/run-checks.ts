/**
 * Hybrid / machine check engine — produces a Report (design §4, §7).
 * Path-unit vertical slice: live adapter detect + skills hub alignment + scoring.
 * Domain depth refined by later REQs; cannot-be-green on desync is enforced here.
 */

import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  FULL_ADAPTER_IDS,
  createAdapterRegistry,
  type AdapterRegistry,
  type AgentAdapter,
} from "../adapters/index.js";
import { agentDoctorHome, loadMap } from "../map/load.js";
import { resolveSkillsHub } from "./skills-hub.js";
import {
  averageScore,
  capGradeForDesync,
  scoreToGrade,
} from "./score.js";
import {
  HOME_MAP_VERSION,
  type AgentPresence,
  type DomainResult,
  type Finding,
  type HomeMap,
  type Recommendation,
  type Report,
  type ReportScope,
} from "./types.js";

export type RunChecksOptions = {
  /** hybrid (default status) or machine (--all). */
  scope?: ReportScope;
  /** Project root for hybrid project overlay (default: process.cwd()). */
  projectRoot?: string;
  /** Injected map; when omitted, load from AGENT_DOCTOR_HOME / ~/.agent-doctor. */
  map?: HomeMap | null;
  /** Doctor config home for map load. */
  home?: string;
  /** Injected adapters (tests). When omitted, built from registry + map. */
  adapters?: AgentAdapter[];
  /** Adapter registry when building default adapters. */
  registry?: AdapterRegistry;
  /** Clock for generated_at (tests). */
  now?: () => Date;
};

function emptyMap(): HomeMap {
  return {
    version: HOME_MAP_VERSION,
    skills: { global_roots: [], sync_target: null },
    vaults: [],
    agents: [],
    projects: { roots: [], entries: [] },
  };
}

function resolvePath(path: string): string {
  try {
    if (existsSync(path)) {
      return realpathSync(path);
    }
  } catch {
    // fall through
  }
  return resolve(path);
}

/**
 * Build adapters for live checks: all full adapters + any presence entries from map.
 */
export function buildDefaultAdapters(
  map: HomeMap,
  registry: AdapterRegistry = createAdapterRegistry(),
): AgentAdapter[] {
  const adapters: AgentAdapter[] = [];
  const seen = new Set<string>();

  for (const id of FULL_ADAPTER_IDS) {
    const mapAgent = map.agents.find((a) => a.id === id);
    const adapter = registry.getAdapter(
      id,
      mapAgent?.config_home ? { home: mapAgent.config_home } : {},
    );
    if (adapter) {
      adapters.push(adapter);
      seen.add(id);
    }
  }

  for (const mapAgent of map.agents) {
    if (seen.has(mapAgent.id)) continue;
    const adapter = registry.getAdapter(mapAgent.adapter || mapAgent.id, {
      home: mapAgent.config_home || undefined,
    });
    if (adapter) {
      adapters.push(adapter);
      seen.add(mapAgent.id);
    }
  }

  return adapters;
}

function applyMapMeta(
  presence: AgentPresence,
  map: HomeMap,
): AgentPresence {
  const row = map.agents.find((a) => a.id === presence.id);
  if (!row) return presence;
  return {
    ...presence,
    primary: row.primary,
    ignored: row.ignored,
  };
}

/**
 * True when any of the agent's skill roots resolves to the hub path.
 */
export function isAgentOnHub(agentRoots: string[], hub: string): boolean {
  const hubResolved = resolvePath(hub);
  return agentRoots.some((root) => resolvePath(root) === hubResolved);
}

function firstClassDeep(presence: AgentPresence): boolean {
  return (
    presence.depth === "deep" &&
    (FULL_ADAPTER_IDS as readonly string[]).includes(presence.id)
  );
}

/**
 * Run hybrid/machine checks and build a Report.
 */
export async function runChecks(
  options: RunChecksOptions = {},
): Promise<Report> {
  const scope: ReportScope = options.scope ?? "hybrid";
  const projectRoot = options.projectRoot ?? process.cwd();
  const home = options.home ?? agentDoctorHome();
  const map =
    options.map !== undefined
      ? (options.map ?? emptyMap())
      : (loadMap({ home }) ?? emptyMap());
  const registry = options.registry ?? createAdapterRegistry();
  const adapters =
    options.adapters ?? buildDefaultAdapters(map, registry);
  const now = options.now ?? (() => new Date());

  const ctx = { projectRoot };

  // Live detect every adapter; merge map ignored/primary flags.
  const agents: AgentPresence[] = [];
  for (const adapter of adapters) {
    const detected = await adapter.detect();
    agents.push(applyMapMeta(detected, map));
  }

  const hubResolution = await resolveSkillsHub({ map, adapters, ctx });
  const hub = hubResolution.hub;
  const hubConflict = hubResolution.findings.some(
    (f) => f.id === "skills.hub_conflict",
  );

  const findings: Finding[] = [...hubResolution.findings];
  const agentsInScope: string[] = [];
  const offHubAgents: string[] = [];

  for (const presence of agents) {
    if (!presence.installed) continue;
    if (presence.ignored) continue;
    agentsInScope.push(presence.id);

    if (!firstClassDeep(presence)) {
      // Presence-only / shallow: listed in fleet but do not gate hub green.
      continue;
    }

    const roots = hubResolution.agentRoots[presence.id] ?? [];
    if (!hub) {
      // No resolved hub: first-class agents with any private root count as off.
      if (roots.length > 0 || hubConflict) {
        offHubAgents.push(presence.id);
      } else if (hubResolution.findings.some((f) => f.id === "skills.no_hub")) {
        // Installed first-class agent with no skills path and no hub.
        offHubAgents.push(presence.id);
      }
      continue;
    }

    if (!isAgentOnHub(roots, hub)) {
      offHubAgents.push(presence.id);
      const evidence =
        roots.length > 0 ? roots : [`${presence.config_home ?? presence.id}:no-skills-path`];
      findings.push({
        id: "skills.agent_not_on_hub",
        severity: "error",
        domain: "shared_skills_path",
        message: `${presence.id} is not wired to the skills sync target`,
        evidence,
        agents_affected: [presence.id],
        sync_target: hub,
      });
    }
  }

  // Desync when any first-class agent is off hub, or hub conflict / no shared hub
  // while first-class agents are in scope.
  const firstClassInScope = agents.filter(
    (a) => a.installed && !a.ignored && firstClassDeep(a),
  );
  const aligned =
    !hubConflict &&
    offHubAgents.length === 0 &&
    (firstClassInScope.length === 0 || Boolean(hub));

  const domains = buildDomains({
    agents,
    hub,
    aligned,
    hubConflict,
    offHubAgents,
    map,
    hubFindings: hubResolution.findings,
  });

  const rawScore = averageScore(domains.map((d) => d.score));
  let grade = scoreToGrade(rawScore);
  grade = capGradeForDesync(grade, { aligned, hubConflict });
  // Keep overall.score consistent with capped grade when desync forces yellow
  // from an otherwise-green average.
  let score = rawScore;
  if (grade !== "green" && aligned === false && score >= 80) {
    score = 79;
  }
  if (hubConflict && score >= 80) {
    score = Math.min(score, 40);
    grade = scoreToGrade(score);
    grade = capGradeForDesync(grade, { aligned, hubConflict });
  }

  const recommendations = buildRecommendations(findings, hub);

  const memoryHubs = map.vaults.map((v) => v.path);

  return {
    generated_at: now().toISOString(),
    scope,
    project_root: projectRoot,
    sync: {
      skills_hub: hub,
      memory_hubs: memoryHubs,
      agents_in_scope: agentsInScope,
      aligned,
    },
    overall: { score, grade },
    agents,
    domains,
    findings,
    recommendations,
  };
}

type DomainBuildInput = {
  agents: AgentPresence[];
  hub?: string;
  aligned: boolean;
  hubConflict: boolean;
  offHubAgents: string[];
  map: HomeMap;
  hubFindings: Finding[];
};

function buildDomains(input: DomainBuildInput): DomainResult[] {
  const installed = input.agents.filter((a) => a.installed);
  const firstClass = installed.filter((a) => firstClassDeep(a));

  // 1. Agent presence
  let presenceScore = 100;
  let presenceSummary = "No agents detected";
  if (firstClass.length > 0) {
    presenceScore = 100;
    presenceSummary = `${firstClass.length} first-class agent(s) detected`;
  } else if (installed.length > 0) {
    presenceScore = 80;
    presenceSummary = `${installed.length} agent(s) detected (presence-only)`;
  } else {
    presenceScore = 50;
    presenceSummary = "No agents detected on this machine";
  }

  // 2. Shared skills path
  let skillsScore: number;
  let skillsSummary: string;
  if (input.hubConflict) {
    skillsScore = 20;
    skillsSummary = "Multiple skills hubs conflict; set sync_target";
  } else if (!input.hub && firstClass.length > 0) {
    skillsScore = 30;
    skillsSummary = "No skills hub resolved";
  } else if (input.offHubAgents.length > 0) {
    const total = Math.max(firstClass.filter((a) => !a.ignored).length, 1);
    const onHub = total - input.offHubAgents.length;
    skillsScore = Math.round((onHub / total) * 100);
    skillsSummary = `${input.offHubAgents.length} agent(s) off skills hub`;
  } else if (input.hub) {
    skillsScore = 100;
    skillsSummary = `All in-scope agents on hub ${input.hub}`;
  } else {
    skillsScore = 70;
    skillsSummary = "No hub and no first-class agents requiring sync";
  }

  // 3. Instruction files (light — deep checks deferred)
  const instructionScore = installed.length > 0 ? 80 : 60;
  const instructionSummary =
    installed.length > 0
      ? "Instruction surfaces checked at adapter depth"
      : "No agents to check for instruction files";

  // 4. Product context (light)
  const productScore = 90;
  const productSummary = "Product link checks deferred to deep domain suite";

  // 5. Obsidian / vaults
  let vaultScore: number;
  let vaultSummary: string;
  if (input.map.vaults.length > 0) {
    vaultScore = 90;
    vaultSummary = `${input.map.vaults.length} vault(s) mapped`;
  } else {
    vaultScore = 60;
    vaultSummary = "No vault configured — re-run init to map a vault path";
  }

  // 6. Cross-agent consistency
  let crossScore: number;
  let crossSummary: string;
  if (input.hubConflict) {
    crossScore = 20;
    crossSummary = "Fleet skills roots diverge (hub conflict)";
  } else if (!input.aligned && firstClass.length > 1) {
    crossScore = 40;
    crossSummary = "Fleet not fully aligned on shared skills hub";
  } else if (input.aligned) {
    crossScore = 100;
    crossSummary = "Cross-agent skills alignment OK";
  } else {
    crossScore = 60;
    crossSummary = "Partial fleet; alignment incomplete";
  }

  const raw: Array<Omit<DomainResult, "grade"> & { score: number }> = [
    {
      domain: "agent_presence",
      score: presenceScore,
      summary: presenceSummary,
    },
    {
      domain: "shared_skills_path",
      score: skillsScore,
      summary: skillsSummary,
    },
    {
      domain: "instruction_files",
      score: instructionScore,
      summary: instructionSummary,
    },
    {
      domain: "product_context",
      score: productScore,
      summary: productSummary,
    },
    {
      domain: "obsidian",
      score: vaultScore,
      summary: vaultSummary,
    },
    {
      domain: "cross_agent_consistency",
      score: crossScore,
      summary: crossSummary,
    },
  ];

  return raw.map((d) => ({
    ...d,
    grade: scoreToGrade(d.score),
  }));
}

function buildRecommendations(
  findings: Finding[],
  hub?: string,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const offHub = findings.filter((f) => f.id === "skills.agent_not_on_hub");
  if (offHub.length > 0 && hub) {
    const agents = [
      ...new Set(offHub.flatMap((f) => f.agents_affected)),
    ];
    recs.push({
      id: "rec.wire_off_hub_agents",
      finding_ids: offHub.map((f) => f.id),
      message: `Wire ${agents.join(" + ")} to ${hub} (no copy)`,
      priority: 1,
    });
  }

  const conflict = findings.find((f) => f.id === "skills.hub_conflict");
  if (conflict) {
    recs.push({
      id: "rec.choose_sync_target",
      finding_ids: [conflict.id],
      message:
        "Choose one skills hub (set sync_target in map) before wiring agents",
      priority: 1,
    });
  }

  const noHub = findings.find((f) => f.id === "skills.no_hub");
  if (noHub) {
    recs.push({
      id: "rec.establish_skills_hub",
      finding_ids: [noHub.id],
      message:
        "Establish a populated skills hub and set sync_target if multiple candidates appear",
      priority: 2,
    });
  }

  return recs;
}
