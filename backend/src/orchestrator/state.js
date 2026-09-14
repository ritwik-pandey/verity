export const initialState = {
  sessionId: null,
  rawInput: {
    text: "",
    imageUrl: "",
    claimedCoords: null,
    images: [],
    submittedAt: null,
  },
  extracted: null,       // Node 2 output
  fraudResult: null,     // fraud tool output
  fraudBlocked: false,   // true = EXIF hard-fail short-circuit
  severity: null,
  payout: null,
  parityGate: null,      // prismSafety result
  status: "pending",     // pending | flagged | verified | blocked
};