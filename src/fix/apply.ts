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
        reason: `conflict: ${path} already exists (not replaced; pass force to overwrite non-empty path)`,
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
function linkBlock(productPath: string): string {
  const base = basename(productPath);
  return [
    '',
    '<!-- agent-doctor:link -->',
    `Product context: [${base}](${base})`,
    '<!-- /agent-doctor:link -->',
    '',
  ].join('\n');
}

function applyAppendLink(action: FixAction, ctx: ApplyContext): ActionResult {
  const target = action.target;
  const product = action.value;
  if (!target || !product) {
    return {
      action,
      status: 'skipped',
      reason: 'missing target or link path',
    };
  }

  if (!existsSync(target)) {
    return {
      action,
      status: 'skipped',
      reason: `instruction file missing: ${target}`,
    };
  }

  let content = '';
  try {
    content = readFileSync(target, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { action, status: 'skipped', reason: message };
  }

  const base = basename(product);
  // Idempotent: marker block already present, or product basename already linked
  if (
    content.includes('<!-- agent-doctor:link -->') ||
    content.toLowerCase().includes(base.toLowerCase())
  ) {
    return { action, status: 'applied', reason: 'link already present' };
  }

  if (ctx.dryRun) {
    return { action, status: 'applied', reason: 'dry-run' };
  }

  try {
    appendFileSync(target, linkBlock(product), 'utf8');
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
  // Wire memory is link-only append when target instruction file is set
  if (action.target && action.value) {
    return applyAppendLink(
      {
        ...action,
        kind: 'append_instruction_link',
      },
      ctx,
    );
  }
  return {
    action,
    status: 'skipped',
    reason: 'wire_memory_pointer requires target instruction file and vault path',
  };
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
  for (const r of results) {
    const mark = r.status === 'applied' ? '✓' : r.status === 'rejected' ? '✗' : '–';
    lines.push(`  ${mark} [${r.status}] ${r.action.id}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}
