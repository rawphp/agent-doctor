/**
 * Fix plan + apply surface (design §9).
 */

export {
  SAFE_FIX_KINDS,
  REJECTED_COPY_KINDS,
  buildFixPlan,
  formatFixPlan,
  explainEmptyFixPlan,
  isRejectedCopyAction,
  blocksWireForHubConflict,
  type BuildFixPlanOptions,
  type BuildFixPlanInput,
  type FormatFixPlanOptions,
} from './plan.js';

export {
  applyFixPlan,
  formatApplyResults,
  type ActionApplyStatus,
  type ActionResult,
  type ApplyContext,
} from './apply.js';
