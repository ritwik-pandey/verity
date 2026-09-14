import Groq from "groq-sdk";
import "dotenv/config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You extract objective physical severity parameters from disaster relief claims,
regardless of how articulate, panicked, or colloquial the phrasing is. Two claims describing the
same physical situation MUST produce identical structured output, even if one is grammatically
perfect and the other is broken/slang.

Examples:

Input: "My residence is inundated with three feet of water; elderly family members require immediate evacuation."
Output: {"waterDepthFt": 3, "structuralIntegrity": "intact", "entrapmentStatus": false, "dependantsAtRisk": ["elderly"], "evacuationNeeded": true, "confidenceScore": 0.95}

Input: "water to my knees house gone help us"
Output: {"waterDepthFt": 2, "structuralIntegrity": "destroyed", "entrapmentStatus": false, "dependantsAtRisk": [], "evacuationNeeded": true, "confidenceScore": 0.7}

Input: "trapped 2nd floor water rising fast kids w me"
Output: {"waterDepthFt": null, "structuralIntegrity": "unknown", "entrapmentStatus": true, "dependantsAtRisk": ["children"], "evacuationNeeded": true, "confidenceScore": 0.92}

Respond ONLY with JSON matching this schema:
{"waterDepthFt": number|null, "structuralIntegrity": "intact"|"damaged"|"destroyed"|"unknown", "entrapmentStatus": boolean, "dependantsAtRisk": string[], "evacuationNeeded": boolean, "confidenceScore": number}

Never invent facts. Use null, false, or an empty array when unsupported. confidenceScore must be from 0 to 1.`;

const STRUCTURAL_INTEGRITY = new Set(["intact", "damaged", "destroyed", "unknown"]);
const VULNERABLE_DEPENDANTS = new Set(["children", "elderly", "disabled", "pregnant"]);

export function validateExtraction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid extraction: expected object");
  const { waterDepthFt, structuralIntegrity, entrapmentStatus, dependantsAtRisk, evacuationNeeded, confidenceScore } = value;
  if (waterDepthFt !== null && (!Number.isFinite(waterDepthFt) || waterDepthFt < 0 || waterDepthFt > 100)) {
    throw new Error("Invalid extraction: waterDepthFt must be null or 0-100");
  }
  if (!STRUCTURAL_INTEGRITY.has(structuralIntegrity)) throw new Error("Invalid extraction: unsupported structuralIntegrity");
  if (typeof entrapmentStatus !== "boolean" || typeof evacuationNeeded !== "boolean") throw new Error("Invalid extraction: flags must be boolean");
  if (!Array.isArray(dependantsAtRisk) || dependantsAtRisk.some((item) => !VULNERABLE_DEPENDANTS.has(item))) {
    throw new Error("Invalid extraction: unsupported dependant category");
  }
  if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1) {
    throw new Error("Invalid extraction: confidenceScore must be 0-1");
  }
  return { waterDepthFt, structuralIntegrity, entrapmentStatus, dependantsAtRisk: [...new Set(dependantsAtRisk)], evacuationNeeded, confidenceScore };
}

import { appendTraceStep } from "../../../config/prism.js";

export async function node2DialectNeutralExtraction(state) {
  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    temperature: 0,
    max_tokens: 250,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: state.rawInput.text },
    ],
  });

  const raw = completion.choices[0].message.content;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid extraction: model did not return JSON");
  }
  const extracted = validateExtraction(parsed);
  const latencyMs = Date.now() - start;

  if (state.sessionId) {
    await appendTraceStep(state.sessionId, {
      step: "dialect_neutral_extraction",
      model: "qwen/qwen3.8-27b",
      latencyMs,
      output: extracted,
      metadata: { input_text: state.rawInput.text },
    });
  }

  return { ...state, extracted };
}
