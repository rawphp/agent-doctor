import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGrokAdapter } from './grok.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, '..', '..', 'fixtures', 'agents', 'grok');
const HOME_WITH_SKILLS = join(FIXTURE_ROOT, 'home');
const HOME_NO_SKILLS = join(FIXTURE_ROOT, 'home-no-skills');
const PROJECT_ROOT = join(FIXTURE_ROOT, 'project');

describe('Grok adapter', () => {
  describe('detect', () => {
    it('returns present/installed when config home exists in fixture', async () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const presence = await adapter.detect();

      expect(presence.id).toBe('grok');
      expect(presence.adapter).toBe('grok');
      expect(presence.installed).toBe(true);
      // AC: present when fixture/home exists
      expect(presence.config_home).toBe(HOME_WITH_SKILLS);
      expect(presence.depth).toBe('deep');
    });

    it('returns installed=false when config home is missing', async () => {
      const adapter = createGrokAdapter({
        home: join(FIXTURE_ROOT, 'does-not-exist'),
      });
      const presence = await adapter.detect();

      expect(presence.installed).toBe(false);
      expect(presence.config_home).toBeUndefined();
      expect(presence.depth).toBe('deep');
    });
  });

  describe('skillsRoots', () => {
    it('lists configured or conventional skill paths that exist', async () => {
      const withSkills = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const roots = await withSkills.skillsRoots();

      // User skills + bundled skills when present under ~/.grok
      expect(roots).toContain(join(HOME_WITH_SKILLS, 'skills'));
      expect(roots).toContain(join(HOME_WITH_SKILLS, 'bundled', 'skills'));
      for (const root of roots) {
        expect(root.startsWith(HOME_WITH_SKILLS)).toBe(true);
      }

      const noSkills = createGrokAdapter({ home: HOME_NO_SKILLS });
      const emptyRoots = await noSkills.skillsRoots();
      // No skills/ or bundled/skills/ under home-no-skills
      expect(emptyRoots).toEqual([]);
    });

    it('includes project .grok/skills when projectRoot is provided and exists', async () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const roots = await adapter.skillsRoots({ projectRoot: PROJECT_ROOT });

      expect(roots).toContain(join(HOME_WITH_SKILLS, 'skills'));
      expect(roots).toContain(join(HOME_WITH_SKILLS, 'bundled', 'skills'));
      expect(roots).toContain(join(PROJECT_ROOT, '.grok', 'skills'));
    });
  });

  describe('instructionFiles', () => {
    it('finds project AGENTS.md / GROK.md when projectRoot provided', async () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const files = await adapter.instructionFiles(PROJECT_ROOT);

      expect(files).toContain(join(PROJECT_ROOT, 'AGENTS.md'));
      expect(files).toContain(join(PROJECT_ROOT, 'GROK.md'));
    });

    it('includes user-level config.toml from config home when present', async () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const files = await adapter.instructionFiles();

      expect(files).toContain(join(HOME_WITH_SKILLS, 'config.toml'));
    });

    it('only reports instruction paths that exist', async () => {
      const adapter = createGrokAdapter({ home: HOME_NO_SKILLS });
      const files = await adapter.instructionFiles(join(FIXTURE_ROOT, 'missing-project'));

      expect(files).toContain(join(HOME_NO_SKILLS, 'config.toml'));
      expect(files.every((f) => !f.includes('missing-project'))).toBe(true);
    });
  });

  describe('expectedInstructionFiles (hierarchy presence)', () => {
    it('lists AGENTS.md first then GROK.md pointer surface', () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      expect(adapter.expectedInstructionFiles).toBeTypeOf('function');
      const expected = adapter.expectedInstructionFiles!(PROJECT_ROOT);
      expect(expected[0]).toBe(join(PROJECT_ROOT, 'AGENTS.md'));
      expect(expected).toContain(join(PROJECT_ROOT, 'GROK.md'));
      expect(adapter.expectedInstructionFiles!()).toEqual([]);
    });
  });

  describe('memoryPointers', () => {
    it('returns an array (empty when no memory config discovered)', async () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const pointers = await adapter.memoryPointers(PROJECT_ROOT);
      expect(Array.isArray(pointers)).toBe(true);
    });
  });

  describe('proposeWireToSkillsHub', () => {
    it('emits non-copy fix actions (symlink or wire to hub)', () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const hub = '/Users/me/skills-hub';
      const actions = adapter.proposeWireToSkillsHub(hub);

      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action.agent_id).toBe('grok');
        expect(action.kind).not.toMatch(/copy/i);
        expect(action.description).not.toMatch(/copy content|content copy|duplicate/i);
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
      expect(primary.target === join(HOME_WITH_SKILLS, 'skills') || primary.target === hub).toBe(
        true,
      );
    });

    it('still proposes symlink when skills path is missing (create link at expected path)', () => {
      const adapter = createGrokAdapter({ home: HOME_NO_SKILLS });
      const actions = adapter.proposeWireToSkillsHub('/tmp/skills-hub-test');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]!.kind).toMatch(/symlink|wire/);
    });
  });

  describe('proposeWireMemory', () => {
    it('returns FixAction(s) for vault paths without content copy', () => {
      const adapter = createGrokAdapter({ home: HOME_WITH_SKILLS });
      const actions = adapter.proposeWireMemory(['/Users/me/vaults/notes']);
      expect(Array.isArray(actions)).toBe(true);
      for (const action of actions) {
        expect(action.kind).not.toMatch(/copy/i);
        expect(action.agent_id).toBe('grok');
      }
    });
  });
});
