export {
  detectFirstClassAgents,
  createPresenceAdapter,
  reportsSkillsOnHub,
  PRESENCE_ONLY_LIMITATION,
  DEFAULT_PRESENCE_AGENT_IDS,
  type PresenceDetectOptions,
  type PresenceAdapterOptions,
} from './presence.js';
export {
  createAdapterRegistry,
  listAdapterSupport,
  getAdapter,
  getSupportLevel,
  FULL_ADAPTER_IDS,
  type AdapterRegistry,
  type AdapterSupportLevel,
  type AdapterSupportEntry,
  type AdapterRegistryOptions,
  type AdapterFactoryOptions,
} from './registry.js';
export type { AdapterContext, AgentAdapter } from './types.js';
export {
  createClaudeCodeAdapter,
  claudeCodeAdapter,
  claudeSkillsAlreadyWired,
  type ClaudeCodeAdapterOptions,
} from './claude-code.js';
export {
  createCodexAdapter,
  codexAdapter,
  codexSkillsAlreadyWired,
  type CodexAdapterOptions,
} from './codex.js';
export {
  createGrokAdapter,
  grokAdapter,
  grokSkillsAlreadyWired,
  type GrokAdapterOptions,
} from './grok.js';
