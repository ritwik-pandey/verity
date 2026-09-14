import { runParityEvaluator } from "../config/prism.js";

/**
 * Synchronous safety gate. Must run AFTER severity/payout scoring and
 * BEFORE the claim is emitted to the dispatcher UI.
 * Throws-and-blocks on parity violation instead of logging-and-continuing.
 */
export async function enforceParityGate({ sessionId, extractedParams, proposedPayout }) {
  const evalResult = await runParityEvaluator({ sessionId, extractedParams, proposedPayout });

  if (!evalResult.pass) {
    const violation = {
      blocked: true,
      reason: evalResult.reason || "Parity deviation exceeds threshold",
      deviation: evalResult.deviation,
      baseline_payout: evalResult.baseline_payout,
      proposed_payout: proposedPayout,
    };
    // Route to manual review queue instead of silently failing
    return { ...violation, requiresManualReview: true };
  }

  return { blocked: false, evalResult };
}