import Groq from "groq-sdk";
import "dotenv/config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You extract objective physical severity parameters from disaster relief claims,
regardless of how articulate, panicked, or colloquial the phrasing is. Two claims describing the
same physical situation MUST produce identical structured output, even if one is grammatically
perfect and the other is broken/slang.

Examples:

Input: "My residence is inundated with three feet of water; elderly family members require immediate evacuation."
Output: {"waterDepthFt": 3, "structuralIntegrity": "intact", "entrapmentStatus": false, "dependantsAtRisk": ["elderly"], "evacuationNeeded": true}

Input: "water to my knees house gone help us"
Output: {"waterDepthFt": 2, "structuralIntegrity": "destroyed", "entrapmentStatus": false, "dependantsAtRisk": [], "evacuationNeeded": true}

Input: "trapped 2nd floor water rising fast kids w me"
Output: {"waterDepthFt": null, "structuralIntegrity": "unknown", "entrapmentStatus": true, "dependantsAtRisk": ["children"], "evacuationNeeded": true}

Respond ONLY with JSON matching this schema:
{"waterDepthFt": number|null, "structuralIntegrity": "intact"|"damaged"|"destroyed"|"unknown", "entrapmentStatus": boolean, "dependantsAtRisk": string[], "evacuationNeeded": boolean}`;

import { appendTraceStep } from "../../../config/prism.js";

export async function node2DialectNeutralExtraction(state) {
  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    temperature: 0,
    max_tokens: 250,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: state.rawInput.text },
    ],
  });

  const raw = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  const extracted = JSON.parse(raw);
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