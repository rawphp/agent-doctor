/**
 * Agent Doctor library entrypoint (package public API).
 *
 * Stable surface for skill/automation consumers — import from the package root
 * (`agent-doctor` / `agent-doctor/dist/index.js`); no deep imports required for:
 *
 * - `runChecks` — hybrid/machine diagnose → Report
 * - `Report` / `HomeMap` / `Finding` types
 * - `buildFixPlan` / `applyFixPlan`
 * - `loadMap` / `saveMap`
 *
 * CLI lives in ./cli.ts. Internals (adapters, domains, surfaces) stay private.
 */

export const PACKAGE_NAME = 'agent-doctor';
export { PACKAGE_VERSION } from './version.js';

export { runChecks, type RunChecksOptions } from './engine/run-checks.js';
export type { Finding, HomeMap, Report } from './engine/types.js';

export { applyFixPlan, buildFixPlan } from './fix/index.js';
export type {
  ActionResult,
  ApplyContext,
  BuildFixPlanInput,
  BuildFixPlanOptions,
} from './fix/index.js';

export { loadMap, saveMap } from './map/index.js';
export type { MapIoOptions } from './map/index.js';
