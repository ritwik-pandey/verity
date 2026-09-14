const TEST_TRACE_PATTERN = /^\s*test(?:\s+trace)?\s+(?:verification|verify)\s*$/i;

export function classifyIntent(rawInput = {}) {
  const isTestTrace = rawInput.isTestTrace === true || TEST_TRACE_PATTERN.test(rawInput.text || "");
  return isTestTrace
    ? { type: "test_verification", confidence: 1, reason: "Explicit test-trace marker." }
    : { type: "claim_submission", confidence: 1, reason: "Claim submission endpoint input." };
}

function guardrail(name, status, outcome, details = {}) {
  return { name, status, outcome, ...details };
}

export function buildComplianceAudit(state) {
  const fraud = state.fraudResult;
  const parity = state.parityGate;
  const extractionValid = Boolean(state.extracted && typeof state.extracted.confidenceScore === "number");
  const guardrails = [
    guardrail("input_validation", state.rawInput?.text?.trim() ? "passed" : "failed", "claim description present"),
    guardrail("intent_classification", state.intent ? "passed" : "failed", state.intent?.type || "missing"),
    guardrail("structured_extraction", extractionValid ? "passed" : "failed", extractionValid ? "schema validated" : "missing or invalid extraction"),
    guardrail(
      "fraud_verification",
      fraud ? "passed" : "failed",
      fraud?.riskCategory || "not evaluated",
      { riskScore: fraud?.fraudRiskScore ?? null }
    ),
    guardrail(
      "parity_gate",
      parity ? "passed" : "failed",
      parity?.blocked ? "claim blocked for parity review" : parity ? "parity passed" : "not evaluated"
    ),
  ];
  const missing = guardrails.filter((item) => item.status !== "passed");
  const guardrailFlags = [
    ...(fraud?.validationFlags || []),
    ...(parity?.blocked ? [parity.reason || "Parity gate blocked the claim"] : []),
    ...missing.map((item) => `${item.name}: ${item.outcome}`),
  ];

  return {
    version: "1.0",
    complianceScore: Math.round(((guardrails.length - missing.length) / guardrails.length) * 100),
    complianceStatus: missing.length === 0 ? "passed" : "failed",
    guardrailsEvaluated: guardrails,
    guardrailFlags,
    auditedAt: new Date().toISOString(),
  };
}

export function buildTestComplianceAudit(intent) {
  return {
    version: "1.0",
    complianceScore: 100,
    complianceStatus: "not_applicable",
    guardrailsEvaluated: [guardrail("intent_classification", "passed", intent.type)],
    guardrailFlags: ["synthetic_test_trace"],
    auditedAt: new Date().toISOString(),
  };
}
