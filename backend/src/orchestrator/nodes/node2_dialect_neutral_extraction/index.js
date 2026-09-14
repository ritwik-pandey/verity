import Groq from "groq-sdk";
import "dotenv/config";
import { z } from "zod";

import { appendTraceStep } from "../../../config/prism.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const extractionSchema = z.object({
  waterDepthFt: z.number().nullable(),
  structuralIntegrity: z.enum(["intact", "damaged", "destroyed", "unknown"]),
  entrapmentStatus: z.boolean(),
  dependantsAtRisk: z.array(z.string()).default([]),
  evacuationNeeded: z.boolean(),
  confidenceScore: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `You are extracting objective physical severity parameters from disaster relief claims.

Your job is to normalize multilingual, dialectal, slang-heavy, panicked, or broken-language reports into a single identical JSON schema for the same physical reality.

Core rules:
1. Normalize all wording into objective physical metrics.
2. Preserve only what is supported by the text; do not invent missing facts.
3. Use the safest neutral value when uncertain: waterDepthFt = null, structuralIntegrity = "unknown", entrapmentStatus = false unless trapped is explicitly stated, dependantsAtRisk = [], evacuationNeeded = false unless evacuation is clearly indicated.
4. If the claim is ambiguous, lower confidenceScore accordingly.
5. Produce identical output for equivalent situations expressed formally or colloquially.

Few-shot examples:
- Spanish: Input "Mi casa está inundada hasta la rodilla y hay niños dentro" -> {"waterDepthFt": 1.5, "structuralIntegrity": "unknown", "entrapmentStatus": false, "dependantsAtRisk": ["children"], "evacuationNeeded": true, "confidenceScore": 0.88}
- Hindi: Input "pani ghutne tak aa gaya hai ghar doob raha hai" -> {"waterDepthFt": 1.5, "structuralIntegrity": "unknown", "entrapmentStatus": false, "dependantsAtRisk": [], "evacuationNeeded": true, "confidenceScore": 0.82}
- AAVE: Input "my house done flooded up to my knees and my grandma still in there" -> {"waterDepthFt": 1.5, "structuralIntegrity": "unknown", "entrapmentStatus": false, "dependantsAtRisk": ["elderly"], "evacuationNeeded": true, "confidenceScore": 0.87}
- Hinglish: Input "ghar mein paani ghutne tak aa gaya hai, bachche andar hain" -> {"waterDepthFt": 1.5, "structuralIntegrity": "unknown", "entrapmentStatus": false, "dependantsAtRisk": ["children"], "evacuationNeeded": true, "confidenceScore": 0.89}
- Formal: Input "My residence is inundated with three feet of water; elderly family members require immediate evacuation." -> {"waterDepthFt": 3, "structuralIntegrity": "intact", "entrapmentStatus": false, "dependantsAtRisk": ["elderly"], "evacuationNeeded": true, "confidenceScore": 0.95}
- Slang/urgent: Input "trapped 2nd floor water rising fast kids w me" -> {"waterDepthFt": null, "structuralIntegrity": "unknown", "entrapmentStatus": true, "dependantsAtRisk": ["children"], "evacuationNeeded": true, "confidenceScore": 0.8}

Return ONLY a JSON object in this exact schema:
{"waterDepthFt": number|null, "structuralIntegrity": "intact"|"damaged"|"destroyed"|"unknown", "entrapmentStatus": boolean, "dependantsAtRisk": string[], "evacuationNeeded": boolean, "confidenceScore": number}

Important: Use exact key names and valid JSON only. Do not wrap the output in Markdown fences.`;

function inferLanguageHint(rawInput = {}) {
  if (rawInput.language) {
    return rawInput.language;
  }

  const sourceName =
    rawInput.audio?.filename ||
    rawInput.audio?.file?.name ||
    "";

  const normalized = sourceName.toLowerCase();

  if (/(hindi|hi|hinglish|urdu|bhojpuri)/.test(normalized)) return "hi";
  if (/(spanish|espanol|es)/.test(normalized)) return "es";
  if (/(english|en)/.test(normalized)) return "en";

  return undefined;
}

function buildTranscriptionPrompt(languageHint) {
  const languageLine = languageHint
    ? `The speaker is likely speaking ${languageHint}.`
    : "Use the audio's original language.";

  return `${languageLine} Transcribe exactly what is said, preserving all emergency details. Include flooding or water level, home damage, trapped or stranded people, children, elderly, evacuation, urgent help needed, and immediate danger. If the speaker uses slang, broken English, Hindi, Hinglish, or a regional dialect, keep the original meaning and critical terms intact. Do not omit life-safety details.`;
}

function buildAudioUploadable(audioInput) {
  if (!audioInput) {
    return null;
  }

  if (audioInput.file) {
    return audioInput.file;
  }

  if (audioInput.buffer instanceof Uint8Array || Buffer.isBuffer(audioInput.buffer)) {
    return new File([audioInput.buffer], audioInput.filename || "voice-note.webm", {
      type: audioInput.mimeType || "audio/webm",
    });
  }

  if (audioInput.base64) {
    const buffer = Buffer.from(audioInput.base64, "base64");
    return new File([buffer], audioInput.filename || "voice-note.webm", {
      type: audioInput.mimeType || "audio/webm",
    });
  }

  return null;
}

async function transcribeAudioIfNeeded(state) {
  const rawInput = state.rawInput || {};
  const existingText = rawInput.text?.trim();

  if (existingText) {
    return existingText;
  }

  const audioUploadable = buildAudioUploadable(rawInput.audio);

  if (!audioUploadable) {
    throw new Error("No text or audio transcript input was provided for extraction.");
  }

  const languageHint = inferLanguageHint(rawInput);

  const transcription = await groq.audio.transcriptions.create({
    file: audioUploadable,
    model: "whisper-large-v3",
    language: languageHint || undefined,
    prompt: buildTranscriptionPrompt(languageHint),
    response_format: "text",
  });

  const transcriptionText = typeof transcription === "string" ? transcription : transcription?.text;

  return transcriptionText?.trim();
}

function normalizeDependantsAtRisk(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 10);
}

function parseAndValidateExtraction(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Failed to parse JSON from the extraction model: ${error.message}`);
  }

  const result = extractionSchema.safeParse({
    ...parsed,
    dependantsAtRisk: normalizeDependantsAtRisk(parsed.dependantsAtRisk),
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid extraction payload: ${issues}`);
  }

  return result.data;
}

function isLowConfidenceExtraction(extracted) {
  if (!extracted) {
    return true;
  }

  if (extracted.confidenceScore < 0.55) {
    return true;
  }

  const minimalEvidence =
    extracted.waterDepthFt === null &&
    !extracted.entrapmentStatus &&
    !extracted.evacuationNeeded &&
    extracted.dependantsAtRisk.length === 0;

  return minimalEvidence;
}

export async function node2DialectNeutralExtraction(state) {
  const start = Date.now();

  const extractedInputText = await transcribeAudioIfNeeded(state);

  let completion = await groq.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    temperature: 0,
    max_tokens: 250,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: extractedInputText },
    ],
  });

  let messageContent = completion.choices?.[0]?.message?.content;

  if (!messageContent) {
    throw new Error("The extraction model returned an empty response.");
  }

  let extracted = parseAndValidateExtraction(messageContent);

  if (state.rawInput?.audio && isLowConfidenceExtraction(extracted)) {
    const retryPrompt =
      "Re-evaluate this emergency report. Preserve explicit flood, trapped, children, elderly, evacuation, or life-risk details. If evidence is weak, return a lower confidence score instead of inventing facts.";

    completion = await groq.chat.completions.create({
      model: "qwen/qwen3.8-27b",
      temperature: 0,
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${extractedInputText}\n\n${retryPrompt}` },
      ],
    });

    messageContent = completion.choices?.[0]?.message?.content;

    if (!messageContent) {
      throw new Error("The retry extraction model returned an empty response.");
    }

    extracted = parseAndValidateExtraction(messageContent);
  }

  if (isLowConfidenceExtraction(extracted)) {
    throw new Error(
      "Extraction confidence was too low to safely use this result. Please retry with a clearer transcript or manual review."
    );
  }

  const latencyMs = Date.now() - start;

  if (state.sessionId) {
    await appendTraceStep(state.sessionId, {
      step: "dialect_neutral_extraction",
      model: "qwen/qwen3.8-27b",
      latencyMs,
      output: extracted,
      metadata: {
        input_text: extractedInputText,
        transcript_source: state.rawInput?.text ? "text" : "audio",
      },
    });
  }

  return {
    ...state,
    rawInput: {
      ...state.rawInput,
      text: extractedInputText,
    },
    extracted,
  };
}
