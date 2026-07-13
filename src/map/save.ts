import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { HomeMap } from '../engine/types.js';
import { agentDoctorHome, mapPath, type MapIoOptions } from './load.js';

/**
 * Persist HomeMap to map.yml under AGENT_DOCTOR_HOME (or ~/.agent-doctor).
 * Creates the home directory when missing.
 */
export function saveMap(map: HomeMap, options: MapIoOptions = {}): void {
  const home = options.home ?? agentDoctorHome();
  const path = mapPath({ home });
  mkdirSync(dirname(path), { recursive: true });

  const document: Record<string, unknown> = {
    version: map.version,
    skills: {
      global_roots: map.skills.global_roots,
      sync_target: map.skills.sync_target,
    },
    vaults: map.vaults.map((v) => ({
      path: v.path,
      source: v.source,
    })),
    agents: map.agents.map((a) => ({
      id: a.id,
      adapter: a.adapter,
      config_home: a.config_home,
      primary: a.primary,
      ignored: a.ignored,
    })),
    projects: {
      roots: map.projects.roots,
      entries: map.projects.entries,
    },
  };

  // Explicit skip marker so later commands know the user chose no vault.
  if (map.vaults_skipped !== undefined) {
    document.vaults_skipped = map.vaults_skipped;
  }

  const yaml = stringifyYaml(document, {
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });

  writeFileSync(path, yaml.endsWith('\n') ? yaml : `${yaml}\n`, 'utf8');
}
