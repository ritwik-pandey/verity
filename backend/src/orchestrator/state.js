export const initialState = {
  sessionId: null,
  rawInput: {
    text: "",
    imageUrl: "",
    claimedCoords: null,
    images: [],
    submittedAt: null,
  },
  intent: null,          // Explicitly classified before any claim decision is made
  extracted: null,       // Node 2 output
  fraudResult: null,     // fraud tool output
  fraudBlocked: false,   // true = EXIF hard-fail short-circuit
  severity: null,
  payout: null,
  parityGate: null,      // prismSafety result
  compliance: null,      // Audit record of required guardrails and their outcomes
  status: "pending",     // pending | test_verified | flagged | verified | blocked
};
