import { randomUUID } from "crypto";

export async function node1RawIngestion(state) {
  const sessionId = state.sessionId || randomUUID();
  const rawInput = state.rawInput || {};

  return {
    ...state,
    sessionId,
    rawInput: {
      ...rawInput,
      text: rawInput.text?.trim() || "",
      submittedAt: rawInput.submittedAt || new Date().toISOString(),
    },
  };
}