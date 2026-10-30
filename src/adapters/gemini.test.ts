import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGeminiAdapter } from './gemini.js';

const temps: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-doctor-gemini-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop()!, { recursive: true, force: true });
  }
});

describe('Gemini / Antigravity adapter', () => {
  describe('detect', () => {
    it('is deep and installed when the home exists', async () => {
      const home = tempDir();
      const presence = await createGeminiAdapter({ home }).detect();

      expect(presence.id).toBe('gemini');
      expect(presence.adapter).toBe('gemini');
      expect(presence.installed).toBe(true);
      expect(presence.config_home).toBe(home);
      expect(presence.depth).toBe('deep');
    });

    it('is not installed when the home is missing', async () => {
      const presence = await createGeminiAdapter({ home: join(tempDir(), 'nope') }).detect();

      expect(presence.installed).toBe(false);
      expect(presence.config_home).toBeUndefined();
      expect(presence.depth).toBe('deep');
    });
  });

  describe('skillsRoots', () => {
    it('returns the config skills dir when present', async () => {
      const home = tempDir();
      mkdirSync(join(home, 'config', 'skills'), { recursive: true });

      const roots = await createGeminiAdapter({ home }).skillsRoots();
      expect(roots).toEqual([join(home, 'config', 'skills')]);
    });

    it('returns nothing when config skills is missing', async () => {
      const home = tempDir();
      mkdirSync(join(home, 'config'), { recursive: true });

      expect(await createGeminiAdapter({ home }).skillsRoots()).toEqual([]);
    });

    it('never returns the antigravity builtin tree', async () => {
      const home = tempDir();
      mkdirSync(join(home, 'antigravity-cli', 'builtin', 'skills'), { recursive: true });

      expect(await createGeminiAdapter({ home }).skillsRoots()).toEqual([]);

      mkdirSync(join(home, 'config', 'skills'), { recursive: true });
      const roots = await createGeminiAdapter({ home }).skillsRoots();
      expect(roots).toEqual([join(home, 'config', 'skills')]);
    });

    it.each(['.agents', '.agent', '_agents', '_agent'])(
      'includes project %s/skills when present',
      async (dir) => {
        const home = tempDir();
        const project = tempDir();
        mkdirSync(join(project, dir, 'skills'), { recursive: true });

        const roots = await createGeminiAdapter({ home }).skillsRoots({ projectRoot: project });
        expect(roots).toEqual([join(project, dir, 'skills')]);
      },
    );

    it('orders config skills first, then project variants in order', async () => {
      const home = tempDir();
      const project = tempDir();
      mkdirSync(join(home, 'config', 'skills'), { recursive: true });
      for (const dir of ['_agent', '_agents', '.agent', '.agents']) {
        mkdirSync(join(project, dir, 'skills'), { recursive: true });
      }

      const roots = await createGeminiAdapter({ home }).skillsRoots({ projectRoot: project });
      expect(roots).toEqual([
        join(home, 'config', 'skills'),
        join(project, '.agents', 'skills'),
        join(project, '.agent', 'skills'),
        join(project, '_agents', 'skills'),
        join(project, '_agent', 'skills'),
      ]);
    });
  });

  describe('instructionFiles', () => {
    it('returns whichever of AGENTS.md and GEMINI.md exist', async () => {
      const home = tempDir();
      const project = tempDir();
      const adapter = createGeminiAdapter({ home });

      expect(await adapter.instructionFiles(project)).toEqual([]);

      writeFileSync(join(project, 'GEMINI.md'), '# g\n');
      expect(await adapter.instructionFiles(project)).toEqual([join(project, 'GEMINI.md')]);

      writeFileSync(join(project, 'AGENTS.md'), '# a\n');
      expect(await adapter.instructionFiles(project)).toEqual([
        join(project, 'AGENTS.md'),
        join(project, 'GEMINI.md'),
      ]);
    });

    it('returns nothing without a project root', async () => {
      expect(await createGeminiAdapter({ home: tempDir() }).instructionFiles()).toEqual([]);
    });

    it('returns the home GEMINI.md when it exists, first, with or without a project root', async () => {
      const home = tempDir();
      const project = tempDir();
      const adapter = createGeminiAdapter({ home });
      const homeFile = join(home, 'GEMINI.md');
      writeFileSync(homeFile, '# home\n');

      expect(await adapter.instructionFiles()).toEqual([homeFile]);

      writeFileSync(join(project, 'AGENTS.md'), '# a\n');
      expect(await adapter.instructionFiles(project)).toEqual([
        homeFile,
        join(project, 'AGENTS.md'),
      ]);
    });
  });

  describe('expectedInstructionFiles', () => {
    it('is AGENTS.md then GEMINI.md under the project root', () => {
      const adapter = createGeminiAdapter({ home: tempDir() });
      expect(adapter.expectedInstructionFiles?.('/proj')).toEqual([
        join('/proj', 'AGENTS.md'),
        join('/proj', 'GEMINI.md'),
      ]);
    });

    it('is empty without a project root', () => {
      expect(createGeminiAdapter({ home: tempDir() }).expectedInstructionFiles?.()).toEqual([]);
    });
  });

  describe('memoryPointers', () => {
    it('is empty', async () => {
      expect(await createGeminiAdapter({ home: tempDir() }).memoryPointers('/proj')).toEqual([]);
    });
  });

  describe('proposeWireToSkillsHub', () => {
    it('proposes one symlink of config/skills to the hub', () => {
      const home = '/h/.gemini';
      const actions = createGeminiAdapter({ home }).proposeWireToSkillsHub('/hub');

      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        id: 'fix.wire_gemini_skills',
        kind: 'symlink_skills_hub',
        target: join(home, 'config', 'skills'),
        agent_id: 'gemini',
      });
      expect(actions[0]!.description).toContain('/hub');
    });
  });

  describe('proposeWireMemory', () => {
    it('proposes one pointer per vault into GEMINI.md in the home', () => {
      const home = '/h/.gemini';
      const actions = createGeminiAdapter({ home }).proposeWireMemory(['/v/a', '/v/b']);

      expect(actions.map((a) => a.id)).toEqual([
        'fix.wire_gemini_memory_1',
        'fix.wire_gemini_memory_2',
      ]);
      for (const [i, action] of actions.entries()) {
        expect(action.kind).toBe('wire_memory_pointer');
        expect(action.target).toBe(join(home, 'GEMINI.md'));
        expect(action.value).toBe(['/v/a', '/v/b'][i]);
        expect(action.agent_id).toBe('gemini');
      }
    });
  });
});
