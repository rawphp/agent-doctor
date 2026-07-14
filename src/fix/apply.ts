/**
 * Fix apply layer (design §9).
 * Applies safe plan actions; skips conflicts; never content-copies skill trees.
 */

import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type { FixAction, HomeMap } from '../engine/types.js';
import { loadMap } from '../map/load.js';
import { saveMap } from '../map/save.js';
import { isRejectedCopyAction } from './plan.js';

export type ApplyContext = {
  /** Resolved skills hub for symlink actions. */
  hub?: string;
  /** Doctor home for map load/save. */
  doctorHome?: string;
  /** When true, report would-apply without writing. */
  dryRun?: boolean;
  projectRoot?: string;
  /**
   * When true, allow replacing an existing non-empty non-link path with a
   * symlink. Default false — never overwrite non-empty non-link dirs without
   * this explicit opt-in.
   */
  force?: boolean;
};

export type ActionApplyStatus = 'applied' | 'skipped' | 'rejected';

export type ActionResult = {
  action: FixAction;
  status: ActionApplyStatus;
  reason?: string;
};

function resolveHub(action: FixAction, ctx: ApplyContext): string | undefined {
  if (action.value != null && action.value !== '') return action.value;
  if (ctx.hub != null && ctx.hub !== '') return ctx.hub;
  return undefined;
}

/** True if path exists (including broken symlinks). */
function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function alreadyCorrectSymlink(path: string, hub: string): boolean {
  try {
    if (!pathExists(path)) return false;
    const st = lstatSync(path);
    if (!st.isSymbolicLink()) return false;
    const link = readlinkSync(path);
    const resolved = resolve(dirname(path), link);
    return resolve(resolved) === resolve(hub) || link === hub;
  } catch {
    return false;
  }
}

/** Empty real directory is safe to replace with a hub symlink. */
function isEmptyDirectory(path: string): boolean {
  try {
    const st = lstatSync(path);
    if (!st.isDirectory() || st.isSymbolicLink()) return false;
    return readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

/**
 * Decide whether an existing path may be cleared for a hub symlink.
 * - Correct symlink: handled earlier as already applied.
 * - Empty non-link directory: always safe (no force needed).
 * - Non-empty non-link dir/file or wrong symlink: only when force is true.
 */
function canReplaceExisting(
  path: string,
  force: boolean,
): {
  ok: boolean;
  reason?: string;
} {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) {
      if (force) return { ok: true };
      return {
        ok: false,
        reason: `conflict: ${path} already exists (not replaced)`,
      };
    }
    if (st.isDirectory() && isEmptyDirectory(path)) {
      return { ok: true };
    }
    // Non-empty dir or regular file — require explicit force (default off)
    if (!force) {
      return {
        ok: false,
        reason: `conflict: ${path} already exists and is not empty — re-run with --force to replace with a symlink to the hub (merge unique skills into the hub first)`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: `conflict: ${path} already exists (not replaced)`,
    };
  }
}

function clearPathForSymlink(path: string): void {
  const st = lstatSync(path);
  if (st.isSymbolicLink() || st.isFile()) {
    rmSync(path, { force: true });
    return;
  }
  if (st.isDirectory()) {
    if (isEmptyDirectory(path)) {
      rmdirSync(path);
      return;
    }
    rmSync(path, { recursive: true, force: true });
  }
}

function applySymlink(action: FixAction, ctx: ApplyContext): ActionResult {
  const target = action.target;
  if (!target) {
    return { action, status: 'skipped', reason: 'missing target path' };
  }

  const hub = resolveHub(action, ctx);
  if (!hub) {
    return {
      action,
      status: 'skipped',
      reason: 'no hub / sync_target (refusing silent hub pick)',
    };
  }

  if (alreadyCorrectSymlink(target, hub)) {
    return { action, status: 'applied', reason: 'already linked to hub' };
  }

  const force = ctx.force === true;
  let mustClear = false;

  if (pathExists(target)) {
    const decision = canReplaceExisting(target, force);
    if (!decision.ok) {
      return {
        action,
        status: 'skipped',
        reason: decision.reason,
      };
    }
    mustClear = true;
  }

  if (ctx.dryRun) {
    return { action, status: 'applied', reason: 'dry-run' };
  }

  try {
    if (mustClear) {
      clearPathForSymlink(target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
    }
    symlinkSync(hub, target);
    return { action, status: 'applied' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: 'skipped', reason: message };
  }
}
function productLinkBlock(productPath: string): string {
  const base = basename(productPath);
  return [
    '',
    '<!-- agent-doctor:link -->',
    `Product context: [${base}](${base})`,
    '<!-- /agent-doctor:link -->',
    '',
  ].join('\n');
}

function memoryLinkBlock(vaultPath: string): string {
  const name = basename(vaultPath);
  return [
    '',
    '<!-- agent-doctor:memory -->',
    `Obsidian vault / memory: [${name}](${vaultPath})`,
    '<!-- /agent-doctor:memory -->',
    '',
  ].join('\n');
}

function ensureInstructionFile(path: string): { ok: true } | { ok: false; reason: string } {
  if (existsSync(path)) return { ok: true };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '# Agent instructions\n\n', 'utf8');
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `could not create instruction file: ${message}` };
  }
}

function applyAppendLink(
  action: FixAction,
  ctx: ApplyContext,
  mode: 'product' | 'memory' = 'product',
): ActionResult {
  const target = action.target;
  const linked = action.value;
  if (!target || !linked) {
    return {
      action,
      status: 'skipped',
      reason:
        mode === 'memory'
          ? 'wire_memory_pointer requires target instruction file and vault path'
          : 'missing target or link path',
    };
  }

  if (!existsSync(target)) {
    if (ctx.dryRun) {
      return { action, status: 'applied', reason: 'dry-run (would create instruction file)' };
    }
    const created = ensureInstructionFile(target);
    if (!created.ok) {
      return { action, status: 'skipped', reason: created.reason };
    }
  }

  let content = '';
  try {
    content = readFileSync(target, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: 'skipped', reason: message };
  }

  if (mode === 'memory') {
    if (content.includes(linked)) {
      return { action, status: 'applied', reason: 'vault pointer already present' };
    }
  } else {
    const base = basename(linked);
    if (
      content.includes('<!-- agent-doctor:link -->') ||
      content.toLowerCase().includes(base.toLowerCase())
    ) {
      return { action, status: 'applied', reason: 'link already present' };
    }
  }

  if (ctx.dryRun) {
    return { action, status: 'applied', reason: 'dry-run' };
  }

  try {
    const block = mode === 'memory' ? memoryLinkBlock(linked) : productLinkBlock(linked);
    appendFileSync(target, block, 'utf8');
    return { action, status: 'applied' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: 'skipped', reason: message };
  }
}

function applySetSyncTarget(action: FixAction, ctx: ApplyContext): ActionResult {
  const value = action.value;
  if (!value) {
    return {
      action,
      status: 'skipped',
      reason: 'no sync_target value (refusing silent hub pick)',
    };
  }

  if (ctx.dryRun) {
    return { action, status: 'applied', reason: 'dry-run' };
  }

  try {
    const home = ctx.doctorHome;
    let map: HomeMap | null = home ? loadMap({ home }) : loadMap();
    if (!map) {
      return {
        action,
        status: 'skipped',
        reason: 'map.yml not found — run agent-doctor init first',
      };
    }
    map = {
      ...map,
      skills: { ...map.skills, sync_target: value },
    };
    saveMap(map, home ? { home } : {});
    return { action, status: 'applied' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: 'skipped', reason: message };
  }
}

function applyMemoryPointer(action: FixAction, ctx: ApplyContext): ActionResult {
  // target = instruction file, value = vault path
  return applyAppendLink(action, ctx, 'memory');
}

/**
 * Apply each safe action. On conflict/error: skip and continue.
 * Copy-tree kinds are always rejected (never content-copy skill trees).
 */
export function applyFixPlan(actions: FixAction[], ctx: ApplyContext = {}): ActionResult[] {
  const results: ActionResult[] = [];

  for (const action of actions) {
    if (isRejectedCopyAction(action)) {
      results.push({
        action,
        status: 'rejected',
        reason: 'content-copy of skill trees is forbidden (use symlink-to-hub)',
      });
      continue;
    }

    let result: ActionResult;
    switch (action.kind) {
      case 'symlink_skills_hub':
      case 'wire_skills_hub':
        result = applySymlink(action, ctx);
        break;
      case 'append_instruction_link':
      case 'append_link_block':
        result = applyAppendLink(action, ctx);
        break;
      case 'set_sync_target':
        result = applySetSyncTarget(action, ctx);
        break;
      case 'wire_memory_pointer':
        result = applyMemoryPointer(action, ctx);
        break;
      default:
        result = {
          action,
          status: 'skipped',
          reason: `unsupported kind: ${action.kind}`,
        };
    }
    results.push(result);
  }

  return results;
}

/** Format apply results for terminal. */
export function formatApplyResults(results: ActionResult[]): string {
  if (results.length === 0) {
    return 'No actions applied.\n';
  }
  const lines = ['Apply results:'];
  let applied = 0;
  let skippedForce = 0;
  for (const r of results) {
    const mark = r.status === 'applied' ? '✓' : r.status === 'rejected' ? '✗' : '–';
    lines.push(`  ${mark} [${r.status}] ${r.action.id}${r.reason ? ` — ${r.reason}` : ''}`);
    if (r.status === 'applied') applied += 1;
    if (r.status === 'skipped' && r.reason?.includes('--force')) skippedForce += 1;
  }
  lines.push('');
  lines.push(`Summary: ${applied} applied, ${results.length - applied} skipped/rejected.`);
  if (skippedForce > 0) {
    lines.push('');
    lines.push('Skill dirs already have content. To replace them with hub symlinks:');
    lines.push('  1. Merge any unique skills from ~/.claude/skills (etc.) into your hub');
    lines.push('  2. Re-run: agent-doctor fix --yes --force');
    lines.push('     (--force removes the agent skills folder and symlinks it to the hub)');
  }
  lines.push('');
  return lines.join('\n');
}
