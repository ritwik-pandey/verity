import { randomUUID } from "crypto";

export async function node1RawIngestion(state) {
  const sessionId = state.sessionId || randomUUID();
  return {
    ...state,
    sessionId,
    rawInput: {
      ...state.rawInput,
      submittedAt: state.rawInput?.submittedAt || new Date().toISOString(),
    },
  };
}