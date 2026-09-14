const BASE_GRANT = 500;
const MAX_GRANT = 2000;

export function node3SeverityPayoutScorer(state) {
  const { extracted, fraudResult } = state;

  if (fraudResult?.shortCircuited || fraudResult?.fraudRiskScore >= 0.75) {
    return {
      ...state,
      status: "flagged",
      severity: null,
      payout: 0,
    };
  }

  let severityScore = 0;
  if (extracted.entrapmentStatus) severityScore += 40;
  if (extracted.structuralIntegrity === "destroyed") severityScore += 30;
  else if (extracted.structuralIntegrity === "damaged") severityScore += 15;
  if (extracted.waterDepthFt != null) severityScore += Math.min(extracted.waterDepthFt * 5, 20);
  severityScore += (extracted.dependantsAtRisk?.length || 0) * 10;
  if (extracted.evacuationNeeded) severityScore += 10;

  severityScore = Math.min(severityScore, 100);

  const payout = Math.round(
    BASE_GRANT + (severityScore / 100) * (MAX_GRANT - BASE_GRANT)
  );

  return {
    ...state,
    severity: severityScore,
    payout,
    status: "pending", // awaits parity gate + HIL
  };
}