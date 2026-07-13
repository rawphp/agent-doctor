/**
 * Shared Report / HomeMap schemas (design §6–§7).
 * Contract for status, dashboard, fix, and future native dual-ship.
 */

/** Overall / domain grade. Exit codes: 0 green, 1 yellow, 2 red. */
export const REPORT_GRADES = ["green", "yellow", "red"] as const;
export type Grade = (typeof REPORT_GRADES)[number];

/** hybrid = default status; machine = --all */
export const REPORT_SCOPES = ["hybrid", "machine"] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

export const FINDING_SEVERITIES = ["info", "warn", "error"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** map.yml schema version */
export const HOME_MAP_VERSION = 1 as const;

/** How deeply an adapter inspects an agent. */
export type AdapterDepth = "deep" | "shallow" | "presence-only";

/**
 * Live detection result for one agent on the machine.
 * Distinct from HomeMap agent entries (persisted config).
 */
export type AgentPresence = {
  id: string;
  adapter: string;
  installed: boolean;
  config_home?: string;
  depth: AdapterDepth;
  primary?: boolean;
  ignored?: boolean;
};

/** Result of one domain check (agent presence, skills, instructions, …). */
export type DomainResult = {
  domain: string;
  score: number;
  grade: Grade;
  summary?: string;
};

export type Finding = {
  /** Stable id, e.g. skills.agent_not_on_hub */
  id: string;
  severity: FindingSeverity;
  domain: string;
  message: string;
  /** Paths or other evidence strings */
  evidence: string[];
  agents_affected: string[];
  sync_target?: string;
};

/** Concrete next step derived from findings (Mode B). */
export type Recommendation = {
  id: string;
  finding_ids: string[];
  message: string;
  priority?: number;
};

/** Safe plan-then-apply action (Mode C). */
export type FixAction = {
  id: string;
  kind: string;
  description: string;
  target?: string;
  agent_id?: string;
  finding_ids?: string[];
};

export type Report = {
  generated_at: string;
  scope: ReportScope;
  project_root?: string;
  sync: {
    skills_hub?: string;
    /** e.g. vault paths */
    memory_hubs: string[];
    /** Detected, non-ignored agent ids */
    agents_in_scope: string[];
    aligned: boolean;
  };
  overall: { score: number; grade: Grade };
  agents: AgentPresence[];
  domains: DomainResult[];
  findings: Finding[];
  recommendations: Recommendation[];
  fix_plan?: FixAction[];
};

export type VaultSource = "discovered" | "manual";

export type VaultEntry = {
  path: string;
  source: VaultSource;
};

/** Persisted agent row in map.yml (not live presence). */
export type MapAgent = {
  id: string;
  adapter: string;
  config_home: string;
  primary: boolean;
  ignored: boolean;
};

/**
 * Home map (~/.agent-doctor/map.yml) version 1.
 * @see design §6
 */
export type HomeMap = {
  version: number;
  skills: {
    global_roots: string[];
    /** Required before wire-fixes when multiple hubs have content */
    sync_target: string | null;
  };
  vaults: VaultEntry[];
  /**
   * Explicit marker: user skipped vault configuration during init
   * (interactive empty/skip answer or --yes / non-interactive with zero vaults).
   * Distinguishes "never configured" from "user chose none".
   */
  vaults_skipped?: boolean;
  agents: MapAgent[];
  projects: {
    roots: string[];
    /** Optional cache from last full scan */
    entries: string[];
  };
};
