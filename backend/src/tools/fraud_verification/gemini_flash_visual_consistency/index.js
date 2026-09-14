import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
}

const genAI = new GoogleGenerativeAI(apiKey);
const configuredModel = process.env.GOOGLE_GEMINI_MODEL || "gemini-2.5-flash-lite";

import { appendTraceStep } from "../../../config/prism.js";

export async function checkVisualConsistency({ imageBase64, mimeType, claimedDamageText, sessionId }) {
  const start = Date.now();
  const prompt = `You are a forensic image analyst for disaster relief fraud detection.
Claimed damage description: "${claimedDamageText}"

Inspect the attached image carefully for both damage consistency AND fraud/plagiarism indicators:
1. Damage Consistency: How well does the damage in the image match the claimed disaster description?
2. Stock Photo / Web Download Detection:
   - Does this photo show signs of being a stock photograph (watermarks e.g., Getty, Shutterstock, Alamy, iStock; professional editorial studio lighting; staged disaster setting)?
   - Does it show screenshot or web download artifacts (browser chrome, UI navigation bars, status bars, web image borders, extreme compression from re-saving)?
   - Does it appear to be a famous or recycled historical disaster photo from past news events?
3. Synthetic / AI Generation: Are there generative AI artifacts (Midjourney, DALL-E, warping, impossible physics, synthetic water textures)?

Respond ONLY with valid JSON:
{
  "consistencyScore": <0.0 to 1.0, how well image matches claimed damage>,
  "isLikelyStockOrWebImage": <boolean, true if stock photo, web screenshot, news photo, or downloaded internet image>,
  "webOrStockIndicators": [<string array of specific indicators detected, e.g. "Getty watermark", "Web screenshot UI borders", "Professional editorial news photography", "Staged/stock composition", or empty array>],
  "generativeArtifactsDetected": <boolean>,
  "discrepancyNotes": "<concise forensic summary of findings, or empty string if authentic and consistent>"
}`;

  const modelsToTry = [
    configuredModel,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: imageBase64, mimeType } },
      ]);

      const text = result.response.text().replace(/```json|```/g, "").trim();
      try {
        const rawParsed = JSON.parse(text);
        const parsed = {
          consistencyScore: Number.isFinite(Number(rawParsed.consistencyScore)) ? Number(rawParsed.consistencyScore) : 0.5,
          isLikelyStockOrWebImage: Boolean(rawParsed.isLikelyStockOrWebImage),
          webOrStockIndicators: Array.isArray(rawParsed.webOrStockIndicators) ? rawParsed.webOrStockIndicators : [],
          generativeArtifactsDetected: Boolean(rawParsed.generativeArtifactsDetected),
          discrepancyNotes: typeof rawParsed.discrepancyNotes === "string" ? rawParsed.discrepancyNotes : "",
        };

        const latencyMs = Date.now() - start;

        if (sessionId) {
          await appendTraceStep(sessionId, {
            step: "visual_consistency_check",
            model: modelName,
            latencyMs,
            output: parsed,
            metadata: { claimedDamageText },
          });
        }

        return parsed;
      } catch {
        return {
          consistencyScore: 0,
          isLikelyStockOrWebImage: false,
          webOrStockIndicators: [],
          generativeArtifactsDetected: false,
          discrepancyNotes: "Parse failure — flag for manual review",
        };
      }
    } catch (err) {
      console.warn(`Gemini model ${modelName} call failed:`, err.message);
      // Try next candidate in loop
    }
  }

  // Graceful fallback if all model calls fail/overload
  return {
    consistencyScore: 0.5,
    isLikelyStockOrWebImage: false,
    webOrStockIndicators: [],
    generativeArtifactsDetected: false,
    discrepancyNotes: "Visual model temporarily unavailable; queued for manual review.",
  };
}