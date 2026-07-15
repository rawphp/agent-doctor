---
ur: UR-002
closed_at: 2026-07-15T10:39:53Z
branch: main
path_units: 4
verdict_summary:
  closed: 3
  degraded:evidence-by-test: 1
overall: closed
---

# Closure report — UR-002

## REQ-026 — closed
- req: REQ-026
- entry_point: "`agent-doctor status` / `agent-doctor check instructions` in a project root (or hybrid scope with project)"
- terminal_state: "Report includes stable hierarchy findings when AGENTS.md is missing or required vendor files lack AGENTS.md pointers; healthy hierarchy projects produce no hierarchy findings"
- walk_kind: cli
- action_taken: "From isolated fixtures under /tmp/agent-doctor-close-ur002.9R6p6Y: (1) `cd missing-agents && npx tsx src/cli.ts check instructions --json` (no AGENTS.md, CLAUDE.md without pointer); (2) `cd healthy-hierarchy && npx tsx src/cli.ts check instructions --json` (AGENTS.md + CLAUDE/GROK pointers); (3) `cd agent-doctor && npx tsx src/cli.ts status --json` on merged main project"
- observed_state: "Missing-AGENTS fixture: grade red; findings include instructions.hierarchy_missing_agents_md and instructions.hierarchy_missing_pointer (CLAUDE.md + required GROK.md). Healthy fixture: grade green; findings []. Main project: hierarchy_missing_pointer for missing CLAUDE.md/GROK.md while AGENTS.md present. Terminal output lists same stable ids and recommends fix --dry-run."
- verdict: closed
- evidence_ref: "closure-evidence/req-026-missing-agents.json; req-026-missing-agents.terminal.txt; req-026-healthy.json; req-026-main-status.json"

## REQ-030 — closed
- req: REQ-030
- entry_point: "`agent-doctor fix --dry-run` then `agent-doctor fix` / `--yes` with project hierarchy findings"
- terminal_state: "Dry-run lists create-AGENTS-stub and append-pointer actions; apply creates minimal stub and append-only pointer blocks; re-status shows hierarchy findings cleared for those items"
- walk_kind: cli
- action_taken: "On fixture fix-hierarchy (CLAUDE.md only, no AGENTS.md): `npx tsx src/cli.ts fix --dry-run` then `npx tsx src/cli.ts fix --yes`; pre/post `check instructions --json`"
- observed_state: "Dry-run plan: create_agents_stub → AGENTS.md; append_agents_pointer → CLAUDE.md; append_agents_pointer → GROK.md. Apply: 3 applied. AGENTS.md written as minimal stub; CLAUDE.md kept body + append-only <!-- agent-doctor:agents-pointer --> block. Pre-status hierarchy findings present (red); post-status hierarchy findings cleared, grade green, all instructions findings []."
- verdict: closed
- evidence_ref: "closure-evidence/req-030-fix-dry-run.txt; req-030-fix-apply.txt; req-030-pre-status.json; req-030-post-status.json"

## REQ-033 — closed
- req: REQ-033
- entry_point: "`agent-doctor status` / `check product` when product.md exists under hierarchy-aware project"
- terminal_state: "Product links required on AGENTS.md and any non-pointer instruction files; pure pointer files not required to link product.md directly"
- walk_kind: cli
- action_taken: "`check product --json` / `status --json` on product-policy fixture (AGENTS without product link; pure-pointer CLAUDE; fat GROK; product.md present); plus control fixtures product-healthy and product-fat-claude"
- observed_state: "product-policy: product.missing_link for AGENTS.md and fat GROK.md; pure pointer CLAUDE.md not flagged. product-healthy (AGENTS links product.md + pure pointers): no product findings, grade green. product-fat-claude: product.missing_link on CLAUDE.md only. Matches AGENTS-first + pure-pointer exemption policy. (Note: duplicate case-variant AGENTS/Agents findings observed; does not break the declared terminal claim.)"
- verdict: closed
- evidence_ref: "closure-evidence/req-033-product.json; req-033-status.json; req-033-product.terminal.txt; req-033-product-healthy.json; req-033-product-fat-claude.json"

## REQ-035 — degraded:evidence-by-test
- req: REQ-035
- entry_point: "Agent loads `skills/agent-doctor/SKILL.md` and runs Execution Loop against CLI that implements hierarchy + product policy"
- terminal_state: "Skill text only claims diagnose/plan/apply capabilities the CLI implements; finding ids and fix kinds listed; no “agent freestyle hierarchy when Doctor lacks steps” for covered cases"
- walk_kind: slash-command
- action_taken: "Skill harness not live-walkable from this close session. Static skill contract inspection (`rg` on skills/agent-doctor/SKILL.md) + live CLI id/kind confirmation (REQ-026/030 walks + `check --help`) + `npm test` suite (test.suite_command)"
- observed_state: "SKILL.md lists instructions.hierarchy_missing_agents_md / hierarchy_missing_pointer, fix kinds create_agents_stub / append_agents_pointer, product.missing_link; LOCAL POLICY §6 and Execution Loop prefer agent-doctor fix and forbid freestyle when CLI covers hierarchy. CLI help and live walks emit the same ids/kinds. Suite: 327 passed / 31 files (includes cli-help hierarchy ids, instructions hierarchy domain, fix plan/apply hierarchy kinds, product AGENTS-first)."
- verdict: degraded:evidence-by-test
- evidence_ref: "closure-evidence/req-035-skill-rg.txt; req-035-parity-summary.txt; npm-test-suite.txt (327 passed); covering tests: tests/cli-help.test.ts (hierarchy finding ids), src/domains/instructions.test.ts, src/fix/plan.test.ts (create_agents_stub/append_agents_pointer), src/commands/status.test.ts, src/domains/product.test.ts"
