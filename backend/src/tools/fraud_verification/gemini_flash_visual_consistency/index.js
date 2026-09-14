import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
}

const genAI = new GoogleGenerativeAI(apiKey);
const configuredModel = process.env.GOOGLE_GEMINI_MODEL || "gemini-3.6-flash";

export async function checkVisualConsistency({ imageBase64, mimeType, claimedDamageText }) {
  const model = genAI.getGenerativeModel({ model: configuredModel });

  const prompt = `You are a forensic image analyst for disaster relief fraud detection.
Claimed damage description: "${claimedDamageText}"

Analyze the attached image and respond ONLY with JSON:
{
  "consistencyScore": <0-1, how well image matches claimed damage>,
  "generativeArtifactsDetected": <boolean>,
  "discrepancyNotes": "<short note if image doesn't match claim, else empty string>"
}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageBase64, mimeType } },
  ]);

  const text = result.response.text().replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    return { consistencyScore: 0, generativeArtifactsDetected: false, discrepancyNotes: "Parse failure — flag for manual review" };
  }
}