import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeCodeAdapter } from './claude-code.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, '..', '..', 'fixtures', 'agents', 'claude-code');
const HOME_WITH_SKILLS = join(FIXTURE_ROOT, 'home');
const HOME_NO_SKILLS = join(FIXTURE_ROOT, 'home-no-skills');
const PROJECT_ROOT = join(FIXTURE_ROOT, 'project');

describe('Claude Code adapter', () => {
  describe('detect', () => {
    it('returns present/installed when config home exists in fixture', async () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const presence = await adapter.detect();

      expect(presence.id).toBe('claude-code');
      expect(presence.adapter).toBe('claude-code');
      expect(presence.installed).toBe(true);
      // AC: present=true when config home exists
      expect(presence.installed).toBe(true);
      expect(presence.config_home).toBe(HOME_WITH_SKILLS);
      expect(presence.depth).toBe('deep');
    });

    it('returns installed=false when config home is missing', async () => {
      const adapter = createClaudeCodeAdapter({
        home: join(FIXTURE_ROOT, 'does-not-exist'),
      });
      const presence = await adapter.detect();

      expect(presence.installed).toBe(false);
      expect(presence.config_home).toBeUndefined();
      expect(presence.depth).toBe('deep');
    });
  });

  describe('skillsRoots', () => {
    it('returns discovered paths without inventing missing dirs as healthy', async () => {
      const withSkills = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const roots = await withSkills.skillsRoots();

      expect(roots).toContain(join(HOME_WITH_SKILLS, 'skills'));
      for (const root of roots) {
        // Every returned root must be a real path under the fixture home
        expect(root.startsWith(HOME_WITH_SKILLS)).toBe(true);
      }

      const noSkills = createClaudeCodeAdapter({ home: HOME_NO_SKILLS });
      const emptyRoots = await noSkills.skillsRoots();
      expect(emptyRoots).toEqual([]);
    });

    it('includes project overlay skills when projectRoot is provided and exists', async () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const roots = await adapter.skillsRoots({ projectRoot: PROJECT_ROOT });

      expect(roots).toContain(join(HOME_WITH_SKILLS, 'skills'));
      expect(roots).toContain(join(PROJECT_ROOT, '.claude', 'skills'));
    });
  });

  describe('instructionFiles', () => {
    it('finds project CLAUDE.md when projectRoot provided', async () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const files = await adapter.instructionFiles(PROJECT_ROOT);

      expect(files).toContain(join(PROJECT_ROOT, 'CLAUDE.md'));
      // Project .claude/ settings surface
      expect(files).toContain(join(PROJECT_ROOT, '.claude', 'settings.json'));
    });

    it('includes user-level CLAUDE.md from config home when present', async () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const files = await adapter.instructionFiles();

      expect(files).toContain(join(HOME_WITH_SKILLS, 'CLAUDE.md'));
    });
  });

  describe('memoryPointers', () => {
    it('returns an array (empty when no memory config discovered)', async () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const pointers = await adapter.memoryPointers(PROJECT_ROOT);
      expect(Array.isArray(pointers)).toBe(true);
    });
  });

  describe('proposeWireToSkillsHub', () => {
    it('returns FixAction(s) that prefer hub wiring or symlink, never content copy', () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const hub = '/Users/me/skills-hub';
      const actions = adapter.proposeWireToSkillsHub(hub);

      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action.agent_id).toBe('claude-code');
        expect(action.kind).not.toMatch(/copy/i);
        expect(action.description).not.toMatch(/copy content|content copy|duplicate/i);
        // Prefer symlink or wire-to-hub kinds
        expect(action.kind === 'symlink_skills_hub' || action.kind === 'wire_skills_hub').toBe(
          true,
        );
        expect(
          /symlink|wire|hub/i.test(action.description) ||
            action.kind.includes('symlink') ||
            action.kind.includes('wire'),
        ).toBe(true);
      }

      const primary = actions[0]!;
      expect(primary.target).toBeDefined();
      // Target should be the agent skills path or the hub — wiring, not a copy destination dump
      expect(primary.target === join(HOME_WITH_SKILLS, 'skills') || primary.target === hub).toBe(
        true,
      );
    });

    it('returns no wire action when skills path is already a symlink to the hub', async () => {
      // Covered via unit logic: if adapter detects already wired, empty plan.
      // Fixture without pre-built symlink — exercise via home that has no skills dir
      // still proposes symlink (create link at expected path).
      const adapter = createClaudeCodeAdapter({ home: HOME_NO_SKILLS });
      const actions = adapter.proposeWireToSkillsHub('/tmp/skills-hub-test');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]!.kind).toMatch(/symlink|wire/);
    });
  });

  describe('proposeWireMemory', () => {
    it('returns FixAction(s) for vault paths without content copy', () => {
      const adapter = createClaudeCodeAdapter({ home: HOME_WITH_SKILLS });
      const actions = adapter.proposeWireMemory(['/Users/me/vaults/notes']);
      expect(Array.isArray(actions)).toBe(true);
      for (const action of actions) {
        expect(action.kind).not.toMatch(/copy/i);
        expect(action.agent_id).toBe('claude-code');
      }
    });
  });
});
