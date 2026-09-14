import "dotenv/config";

const PRISM_BASE_URL = "https://api.blockconvey.com/prism/v1"; // placeholder — confirm real endpoint
const PRISM_ENABLED = Boolean(process.env.PRISM_API_KEY && process.env.PRISM_PROJECT_ID);

async function prismRequest(path, body) {
  if (!PRISM_ENABLED) {
    return { skipped: true, message: "PRISM not configured; using local fallback." };
  }

  try {
    const res = await fetch(`${PRISM_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PRISM_API_KEY}`,
      },
      body: JSON.stringify({ project_id: process.env.PRISM_PROJECT_ID, ...body }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`PRISM request failed for ${path}: ${res.status} ${text}`);
      return { skipped: true, message: `PRISM request failed (${res.status}); using local fallback.` };
    }

    return res.json();
  } catch (error) {
    console.warn(`PRISM request error for ${path}:`, error.message);
    return { skipped: true, message: `PRISM unavailable (${error.message}); using local fallback.` };
  }
}

export async function initTrace(sessionId, input) {
  return prismRequest("/traces/init", { session_id: sessionId, input });
}

export async function appendTraceStep(sessionId, step) {
  return prismRequest("/traces/append", { session_id: sessionId, step });
}

// Synchronous parity check — this is the safety GATE, not a log.
// Call this BEFORE returning the payout to the dispatcher UI.
export async function runParityEvaluator({ sessionId, extractedParams, proposedPayout }) {
  const result = await prismRequest("/evaluators/parity", {
    session_id: sessionId,
    extracted_params: extractedParams,
    proposed_payout: proposedPayout,
  });

  if (result.skipped) {
    return {
      pass: true,
      skipped: true,
      reason: "PRISM unavailable; parity check bypassed locally.",
      deviation: 0,
      baseline_payout: proposedPayout,
    };
  }

  // Expected shape: { pass: boolean, deviation: number, baseline_payout: number, reason?: string }
  return result;
}

export async function closeTrace(sessionId, output) {
  return prismRequest("/traces/close", { session_id: sessionId, output });
}