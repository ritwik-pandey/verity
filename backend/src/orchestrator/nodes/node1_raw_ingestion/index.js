import { randomUUID } from "crypto";

export async function node1RawIngestion(state) {
  const sessionId = randomUUID();
  return {
    ...state,
    sessionId,
    rawInput: {
      ...state.rawInput,
      submittedAt: new Date().toISOString(),
    },
  };
}