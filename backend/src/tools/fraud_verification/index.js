import { checkExifIntegrity } from "./exif_metadata_integrity/index.js";
import { checkReverseImageMatch } from "./google_cloud_vision_plagiarism/index.js";
import { checkVisualConsistency } from "./gemini_flash_visual_consistency/index.js";
import "dotenv/config";

const BLOCK_THRESHOLD = Number(process.env.FRAUD_RISK_BLOCK_THRESHOLD || 0.75);

export async function verifyClaimEvidence({ imageBuffer, imageBase64, mimeType, claimedDamageText }) {
  // Layer 1 — cheap, deterministic, runs first and can short-circuit
  const exifResult = await checkExifIntegrity(imageBuffer);

  if (exifResult.hardFail) {
    return {
      fraudRiskScore: 1,
      shortCircuited: true,
      validationFlags: exifResult.reasons,
      layers: { exif: exifResult, webDetection: null, visualConsistency: null },
    };
  }

  // Layers 2 & 3 — only reached if EXIF passes, run concurrently
  const [webResult, visionResult] = await Promise.all([
    checkReverseImageMatch(imageBuffer),
    checkVisualConsistency({ imageBase64, mimeType, claimedDamageText }),
  ]);

  const riskScore = computeRiskScore(exifResult, webResult, visionResult);

  return {
    fraudRiskScore: riskScore,
    shortCircuited: false,
    validationFlags: [
      ...(webResult.isLikelyStockOrReused ? ["Possible reused/stock image"] : []),
      ...(visionResult.generativeArtifactsDetected ? ["Possible AI-generated image"] : []),
      ...(visionResult.discrepancyNotes ? [visionResult.discrepancyNotes] : []),
    ],
    layers: { exif: exifResult, webDetection: webResult, visualConsistency: visionResult },
  };
}

function computeRiskScore(exifResult, webResult, visionResult) {
  let score = 0;
  if (webResult.isLikelyStockOrReused) score += 0.5;
  if (visionResult.generativeArtifactsDetected) score += 0.4;
  score += (1 - visionResult.consistencyScore) * 0.3;
  return Math.min(score, 1);
}

export { BLOCK_THRESHOLD };