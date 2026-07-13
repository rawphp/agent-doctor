/**
 * Hybrid / machine check engine — produces a Report (design §4, §7, §11).
 *
 * Data flow:
 *   map (or one-shot discover) → detect adapters → resolve hub
 *   → domain checks → score → Report
 *
 * Errors (design §11):
 *   - No map → soft warn + one-shot discover + recommend init
 *   - Permission denied → access.denied finding; do not abort whole report
 */

import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
  FULL_ADAPTER_IDS,
  createAdapterRegistry,
  type AdapterRegistry,
  type AgentAdapter,
} from "../adapters/index.js";
import type { AdapterContext } from "../adapters/types.js";
import {
  agentsInScope,
  runAllDomainChecks,
  type DomainCheckContext,
} from "../domains/index.js";
import { discover } from "../map/discover.js";
import { agentDoctorHome, loadMap } from "../map/load.js";
import { computeOverall, scoreToGrade } from "./score.js";
import { resolveSkillsHub } from "./skills-hub.js";
import {
  HOME_MAP_VERSION,
  type AgentPresence,
  type DomainResult,
  type Finding,
  type FixAction,
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
  /** User home for one-shot discover when map is missing (tests). */
  homeDir?: string;
  /** Injected adapters (tests). When omitted, built from registry + map. */
  adapters?: AgentAdapter[];
  /** Adapter registry when building default adapters. */
  registry?: AdapterRegistry;
  /** Clock for generated_at (tests). */
  now?: () => Date;
};

/** Stable domain keys matching runAllDomainChecks.byDomain + display names. */
const DOMAIN_SPECS = [
  { key: "presence", domain: "agent_presence" },
  { key: "skills", domain: "shared_skills_path" },
  { key: "instructions", domain: "instruction_files" },
  { key: "product", domain: "product_context" },
  { key: "obsidian", domain: "obsidian" },
  { key: "consistency", domain: "cross_agent_consistency" },
] as const;

const SEVERITY_PENALTY: Record<Finding["severity"], number> = {
  error: 40,
  warn: 15,
  info: 5,
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

/**
 * True when any of the agent's skill roots resolves to the hub path.
 */
export function isAgentOnHub(agentRoots: string[], hub: string): boolean {
  const hubResolved = resolvePath(hub);
  return agentRoots.some((root) => resolvePath(root) === hubResolved);
}

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM";
}

function accessDeniedFinding(
  agentId: string,
  err: unknown,
  surface: string,
): Finding {
  const message =
    err instanceof Error ? err.message : `Permission denied (${surface})`;
  const pathMatch = message.match(/['"]([^'"]+)['"]/);
  const evidence = pathMatch?.[1] ? [pathMatch[1]] : [surface];
  return {
    id: "access.denied",
    severity: "error",
    domain: "access",
    message: `Permission denied while checking ${agentId} (${surface}): ${message}`,
    evidence,
    agents_affected: agentId ? [agentId] : [],
  };
}

function applyMapMeta(presence: AgentPresence, map: HomeMap): AgentPresence {
  const row = map.agents.find((a) => a.id === presence.id);
  if (!row) return presence;
  return {
    ...presence,
    primary: row.primary,
    ignored: row.ignored,
  };
}

/**
 * Wrap adapter methods so EACCES/EPERM become access.denied findings
 * instead of aborting the whole report.
 */
function wrapAdapterForAccess(
  adapter: AgentAdapter,
  onDenied: (finding: Finding) => void,
): AgentAdapter {
  const wrap = <T>(
    surface: string,
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<T> =>
    fn().catch((err: unknown) => {
      if (isPermissionError(err)) {
        onDenied(accessDeniedFinding(adapter.id, err, surface));
        return fallback;
      }
      throw err;
    });

  return {
    id: adapter.id,
    detect: () =>
      wrap(
        "detect",
        () => adapter.detect(),
        {
          id: adapter.id,
          adapter: adapter.id,
          installed: false,
          depth: "presence-only" as const,
        },
      ),
    skillsRoots: (ctx?: AdapterContext) =>
      wrap("skillsRoots", () => adapter.skillsRoots(ctx), []),
    instructionFiles: (projectRoot?: string) =>
      wrap(
        "instructionFiles",
        () => adapter.instructionFiles(projectRoot),
        [],
      ),
    memoryPointers: (projectRoot?: string) =>
      wrap("memoryPointers", () => adapter.memoryPointers(projectRoot), []),
    proposeWireToSkillsHub: (hub: string) =>
      adapter.proposeWireToSkillsHub(hub),
    proposeWireMemory: (paths: string[]) => adapter.proposeWireMemory(paths),
  };
}

function mergeDiscoveredMap(base: HomeMap, homeDir?: string): HomeMap {
  try {
    const disc = discover(homeDir !== undefined ? { homeDir } : {});
    return {
      ...base,
      skills: {
        global_roots:
          base.skills.global_roots.length > 0
            ? base.skills.global_roots
            : disc.skills_roots,
        sync_target: base.skills.sync_target,
      },
      vaults: base.vaults.length > 0 ? base.vaults : disc.vaults,
      projects: {
        roots:
          base.projects.roots.length > 0
            ? base.projects.roots
            : disc.project_roots,
        entries: base.projects.entries,
      },
    };
  } catch (err) {
    if (isPermissionError(err)) {
      return base;
    }
    throw err;
  }
}

function scoreFromFindings(findings: readonly Finding[]): number {
  let score = 100;
  for (const f of findings) {
    score -= SEVERITY_PENALTY[f.severity] ?? 10;
  }
  return Math.max(0, Math.min(100, score));
}

function summarizeDomain(
  domain: string,
  findings: readonly Finding[],
  score: number,
): string {
  if (findings.length === 0) {
    return `${domain}: healthy`;
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  if (errors > 0) {
    return `${errors} error(s), ${warns} warning(s) (score ${score})`;
  }
  if (warns > 0) {
    return `${warns} warning(s) (score ${score})`;
  }
  return `${findings.length} info finding(s)`;
}

function buildDomainResults(
  byDomain: Record<string, Finding[]>,
  hubFindings: Finding[],
): DomainResult[] {
  return DOMAIN_SPECS.map(({ key, domain }) => {
    const domainFindings =
      key === "skills"
        ? [...hubFindings, ...(byDomain[key] ?? [])]
        : (byDomain[key] ?? []);
    const score = scoreFromFindings(domainFindings);
    return {
      domain,
      score,
      grade: scoreToGrade(score),
      summary: summarizeDomain(domain, domainFindings, score),
    };
  });
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
  const now = options.now ?? (() => new Date());
  const registry = options.registry ?? createAdapterRegistry();

  const accessFindings: Finding[] = [];
  const recordAccess = (f: Finding) => {
    accessFindings.push(f);
  };

  // 1. Load map (or empty + one-shot discover when missing)
  let map: HomeMap;
  let mapWasMissing = false;

  if (options.map !== undefined) {
    map = options.map ?? emptyMap();
  } else {
    const loaded = loadMap({ home });
    if (loaded === null) {
      mapWasMissing = true;
      map = mergeDiscoveredMap(emptyMap(), options.homeDir);
    } else {
      map = loaded;
    }
  }

  // 2. Build adapters from registry + map (or injected)
  const rawAdapters =
    options.adapters ?? buildDefaultAdapters(map, registry);
  const adapters = rawAdapters.map((a) =>
    wrapAdapterForAccess(a, recordAccess),
  );

  const adapterCtx: AdapterContext = { projectRoot };

  // 3. detect() each adapter → AgentPresence[]
  const agents: AgentPresence[] = [];
  for (const adapter of adapters) {
    const detected = await adapter.detect();
    agents.push(applyMapMeta(detected, map));
  }

  // 4. resolveSkillsHub
  let hubResolution;
  try {
    hubResolution = await resolveSkillsHub({
      map,
      adapters,
      ctx: adapterCtx,
    });
  } catch (err) {
    if (isPermissionError(err)) {
      recordAccess(accessDeniedFinding("", err, "resolveSkillsHub"));
      hubResolution = {
        hub: undefined,
        agentRoots: {} as Record<string, string[]>,
        candidates: [],
        populated: [],
        findings: [],
      };
    } else {
      throw err;
    }
  }

  const hub = hubResolution.hub;
  const hubConflict = hubResolution.findings.some(
    (f) => f.id === "skills.hub_conflict",
  );

  // 5. DomainCheckContext + runAllDomainChecks
  const domainCtx: DomainCheckContext = {
    map,
    agents,
    projectRoot,
    hub,
    agentRoots: hubResolution.agentRoots,
    adapters,
  };

  let domainSuite: {
    findings: Finding[];
    fix_actions: FixAction[];
    byDomain: Record<string, Finding[]>;
  };
  try {
    domainSuite = await runAllDomainChecks(domainCtx);
  } catch (err) {
    if (isPermissionError(err)) {
      recordAccess(accessDeniedFinding("", err, "domainChecks"));
      domainSuite = {
        findings: [],
        fix_actions: [],
        byDomain: {
          presence: [],
          skills: [],
          instructions: [],
          product: [],
          obsidian: [],
          consistency: [],
        },
      };
    } else {
      throw err;
    }
  }

  // 6. Collect findings; score domains + overall
  const mapFindings: Finding[] = [];
  if (mapWasMissing) {
    mapFindings.push({
      id: "map.missing",
      severity: "warn",
      domain: "map",
      message:
        "No home map found; ran one-shot discover for this check only. Run init to persist a map.",
      evidence: [home],
      agents_affected: [],
    });
  }

  const findings: Finding[] = [
    ...mapFindings,
    ...accessFindings,
    ...hubResolution.findings,
    ...domainSuite.findings,
  ];

  const domains = buildDomainResults(
    domainSuite.byDomain,
    hubResolution.findings,
  );
  const overall = computeOverall({
    domainScores: domains.map((d) => d.score),
    findings,
  });

  const firstClassInstalled = agents.filter(
    (a) => a.installed && !a.ignored && firstClassDeep(a),
  );
  const hasOffHub = findings.some((f) => f.id === "skills.agent_not_on_hub");
  const aligned =
    !hubConflict &&
    !hasOffHub &&
    (firstClassInstalled.length === 0 || Boolean(hub));

  // agents_in_scope: detected (installed) and non-ignored
  const agents_in_scope = agentsInScope(agents)
    .filter((a) => a.installed)
    .map((a) => a.id);

  // 7. Recommendations (including init when map was missing)
  const recommendations = buildRecommendations(findings, hub, mapWasMissing);

  // 8. Report
  const report: Report = {
    generated_at: now().toISOString(),
    scope,
    project_root: projectRoot,
    sync: {
      skills_hub: hub,
      memory_hubs: map.vaults.map((v) => v.path),
      agents_in_scope,
      aligned,
    },
    overall,
    agents,
    domains,
    findings,
    recommendations,
  };

  if (domainSuite.fix_actions.length > 0) {
    report.fix_plan = domainSuite.fix_actions;
  }

  return report;
}

function buildRecommendations(
  findings: Finding[],
  hub: string | undefined,
  mapWasMissing: boolean,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (mapWasMissing) {
    const mapFinding = findings.find((f) => f.id === "map.missing");
    recs.push({
      id: "rec.run_init",
      finding_ids: mapFinding ? [mapFinding.id] : ["map.missing"],
      message:
        "Run `agent-doctor init` to discover agents/skills/vaults and persist ~/.agent-doctor/map.yml",
      priority: 1,
    });
  }

  const offHub = findings.filter((f) => f.id === "skills.agent_not_on_hub");
  if (offHub.length > 0 && hub) {
    const agents = [...new Set(offHub.flatMap((f) => f.agents_affected))];
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

  const access = findings.filter((f) => f.id === "access.denied");
  if (access.length > 0) {
    recs.push({
      id: "rec.fix_permissions",
      finding_ids: access.map((f) => f.id),
      message:
        "Fix filesystem permissions on denied paths, then re-run status",
      priority: 2,
    });
  }

  return recs;
}
