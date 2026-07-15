/**
 * Agent adapter interface (design §8).
 * First-class adapters implement deep detect + skills/instructions/memory wiring.
 */

import type { AgentPresence, FixAction } from '../engine/types.js';

/** Context passed into adapter discovery methods. */
export type AdapterContext = {
  /** Project root for hybrid/project-scoped discovery */
  projectRoot?: string;
};

/**
 * Per-provider adapter: detect presence, list skills roots and instruction files,
 * and propose non-destructive wires to shared hubs (no content copy).
 */
export interface AgentAdapter {
  readonly id: string;

  /** Detect whether this agent is installed / has a config home. */
  detect(): Promise<AgentPresence>;

  /**
   * Paths this agent uses for skills.
   * Only return roots that exist on disk — never invent missing dirs as healthy.
   */
  skillsRoots(ctx?: AdapterContext): Promise<string[]>;

  /**
   * Instruction files the agent reads (user + project).
   * When projectRoot is set, include project-level files such as CLAUDE.md.
   * AGENTS.md-first: deep adapters should also list project AGENTS.md when present.
   */
  instructionFiles(projectRoot?: string): Promise<string[]>;

  /**
   * Optional: expected project instruction paths for presence / missing_file checks.
   * Paths may not exist yet — domain treats missing paths as findings.
   * AGENTS.md-first: Codex → AGENTS.md; Claude → CLAUDE.md pointer; Grok → AGENTS.md then GROK.md.
   * Presence-only agents (e.g. Gemini) omit this — hierarchy uses map primary + file presence.
   */
  expectedInstructionFiles?(projectRoot?: string): string[];

  /**
   * Memory / vault pointer paths discovered for this agent
   * (user or project config that references shared memory).
   */
  memoryPointers(projectRoot?: string): Promise<string[]>;

  /**
   * Plan how to wire this agent onto the skills sync-target hub.
   * Prefer hub wiring or symlink — never content copy.
   */
  proposeWireToSkillsHub(hub: string): FixAction[];

  /**
   * Plan how to wire memory/vault pointers (non-destructive).
   */
  proposeWireMemory(paths: string[]): FixAction[];
}
