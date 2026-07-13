import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  HOME_MAP_VERSION,
  type HomeMap,
  type MapAgent,
  type VaultEntry,
  type VaultSource,
} from '../engine/types.js';

export type MapIoOptions = {
  /** Override AGENT_DOCTOR_HOME / default ~/.agent-doctor */
  home?: string;
};

/**
 * Doctor home directory for map IO.
 * AGENT_DOCTOR_HOME redirects all map paths (used by tests and custom installs).
 */
export function agentDoctorHome(): string {
  const fromEnv = process.env.AGENT_DOCTOR_HOME?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), '.agent-doctor');
}

/** Absolute path to map.yml under the active doctor home. */
export function mapPath(options: MapIoOptions = {}): string {
  return join(options.home ?? agentDoctorHome(), 'map.yml');
}

/**
 * Load ~/.agent-doctor/map.yml (or $AGENT_DOCTOR_HOME/map.yml).
 * Returns null when the file is absent.
 */
export function loadMap(options: MapIoOptions = {}): HomeMap | null {
  const path = mapPath(options);
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, 'utf8');
  const data = parseYaml(raw) as unknown;
  return normalizeHomeMap(data);
}

function normalizeHomeMap(data: unknown): HomeMap {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('map.yml: expected a mapping at the root');
  }

  const root = data as Record<string, unknown>;
  const version = root.version;
  if (version !== HOME_MAP_VERSION && version !== 1) {
    throw new Error(
      `map.yml: unsupported version ${String(version)}; expected ${HOME_MAP_VERSION}`,
    );
  }

  const skillsRaw =
    root.skills && typeof root.skills === 'object' && !Array.isArray(root.skills)
      ? (root.skills as Record<string, unknown>)
      : {};

  const global_roots = asStringArray(skillsRaw.global_roots);
  const sync_target =
    skillsRaw.sync_target === undefined || skillsRaw.sync_target === null
      ? null
      : String(skillsRaw.sync_target);

  const vaults = asVaults(root.vaults);
  const agents = asAgents(root.agents);

  const projectsRaw =
    root.projects && typeof root.projects === 'object' && !Array.isArray(root.projects)
      ? (root.projects as Record<string, unknown>)
      : {};

  const map: HomeMap = {
    version: HOME_MAP_VERSION,
    skills: { global_roots, sync_target },
    vaults,
    agents,
    projects: {
      roots: asStringArray(projectsRaw.roots),
      entries: asStringArray(projectsRaw.entries),
    },
  };

  if (typeof root.vaults_skipped === 'boolean') {
    map.vaults_skipped = root.vaults_skipped;
  }

  return map;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function asVaults(value: unknown): VaultEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('map.yml: vault entry must be a mapping');
    }
    const row = item as Record<string, unknown>;
    const source = row.source === 'manual' ? 'manual' : 'discovered';
    return {
      path: String(row.path ?? ''),
      source: source as VaultSource,
    };
  });
}

function asAgents(value: unknown): MapAgent[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('map.yml: agent entry must be a mapping');
    }
    const row = item as Record<string, unknown>;
    return {
      id: String(row.id ?? ''),
      adapter: String(row.adapter ?? ''),
      config_home: String(row.config_home ?? ''),
      primary: Boolean(row.primary),
      ignored: Boolean(row.ignored),
    };
  });
}
