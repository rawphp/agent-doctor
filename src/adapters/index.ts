export {
  detectFirstClassAgents,
  type PresenceDetectOptions,
} from "./presence.js";
export type { AdapterContext, AgentAdapter } from "./types.js";
export {
  createClaudeCodeAdapter,
  claudeCodeAdapter,
  claudeSkillsAlreadyWired,
  type ClaudeCodeAdapterOptions,
} from "./claude-code.js";
export {
  createCodexAdapter,
  codexAdapter,
  codexSkillsAlreadyWired,
  type CodexAdapterOptions,
} from "./codex.js";
export {
  createGrokAdapter,
  grokAdapter,
  grokSkillsAlreadyWired,
  type GrokAdapterOptions,
} from "./grok.js";
