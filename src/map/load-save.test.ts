import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOME_MAP_VERSION, type HomeMap } from '../engine/types.js';
import { agentDoctorHome, loadMap, mapPath } from './load.js';
import { saveMap } from './save.js';

const sampleMap = (): HomeMap => ({
  version: HOME_MAP_VERSION,
  skills: {
    global_roots: ['/Users/me/skills-hub', '/Users/me/.agents/skills', '/Users/me/.claude/skills'],
    sync_target: '/Users/me/skills-hub',
  },
  vaults: [
    { path: '/Users/me/vaults/notes', source: 'discovered' },
    { path: '/Users/me/vaults/work', source: 'manual' },
  ],
  agents: [
    {
      id: 'claude-code',
      adapter: 'claude-code',
      config_home: '/Users/me/.claude',
      primary: true,
      ignored: false,
    },
    {
      id: 'codex',
      adapter: 'codex',
      config_home: '/Users/me/.codex',
      primary: false,
      ignored: false,
    },
    {
      id: 'grok',
      adapter: 'grok',
      config_home: '/Users/me/.grok',
      primary: false,
      ignored: true,
    },
  ],
  projects: {
    roots: ['/Users/me/projects', '/Users/me/Developer'],
    entries: ['/Users/me/projects/app'],
  },
});

describe('map load/save', () => {
  let home: string;
  let previousEnv: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agent-doctor-map-'));
    previousEnv = process.env.AGENT_DOCTOR_HOME;
    process.env.AGENT_DOCTOR_HOME = home;
  });

  afterEach(() => {
    if (previousEnv === undefined) {
      delete process.env.AGENT_DOCTOR_HOME;
    } else {
      process.env.AGENT_DOCTOR_HOME = previousEnv;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('agentDoctorHome and mapPath follow AGENT_DOCTOR_HOME', () => {
    expect(agentDoctorHome()).toBe(home);
    expect(mapPath()).toBe(join(home, 'map.yml'));
  });

  it('loadMap returns null when map.yml is missing', () => {
    expect(loadMap()).toBeNull();
  });

  it('saveMap/loadMap round-trip preserves agents, skills, vaults, projects', () => {
    const original = sampleMap();
    saveMap(original);

    expect(existsSync(join(home, 'map.yml'))).toBe(true);

    const loaded = loadMap();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.skills.global_roots).toEqual(original.skills.global_roots);
    expect(loaded!.skills.sync_target).toEqual(original.skills.sync_target);
    expect(loaded!.vaults).toEqual(original.vaults);
    expect(loaded!.agents).toEqual(original.agents);
    expect(loaded!.projects.roots).toEqual(original.projects.roots);
    expect(loaded!.projects.entries).toEqual(original.projects.entries);
  });

  it('round-trips null sync_target', () => {
    const map = sampleMap();
    map.skills.sync_target = null;
    saveMap(map);
    expect(loadMap()?.skills.sync_target).toBeNull();
  });

  it('AGENT_DOCTOR_HOME redirects all map IO away from default home', () => {
    const map = sampleMap();
    saveMap(map);

    const written = readFileSync(join(home, 'map.yml'), 'utf8');
    expect(written).toContain('global_roots:');
    expect(written).toContain('claude-code');
    expect(written).toContain('sync_target:');

    // Explicit home option also works without env
    const other = mkdtempSync(join(tmpdir(), 'agent-doctor-map-other-'));
    try {
      saveMap(map, { home: other });
      expect(existsSync(join(other, 'map.yml'))).toBe(true);
      const fromOther = loadMap({ home: other });
      expect(fromOther?.agents.map((a) => a.id)).toEqual(['claude-code', 'codex', 'grok']);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('saveMap creates AGENT_DOCTOR_HOME directory when missing', () => {
    const nested = join(home, 'nested', 'doctor-home');
    process.env.AGENT_DOCTOR_HOME = nested;
    saveMap(sampleMap());
    expect(existsSync(join(nested, 'map.yml'))).toBe(true);
  });

  it('loadMap rejects unsupported version', () => {
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, 'map.yml'),
      ['version: 99', 'skills:', '  global_roots: []', '  sync_target: null'].join('\n'),
      'utf8',
    );
    expect(() => loadMap()).toThrow(/version/i);
  });
});
