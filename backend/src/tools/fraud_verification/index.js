import { checkExifIntegrity } from "./exif_metadata_integrity/index.js";
import { checkReverseImageMatch } from "./google_cloud_vision_plagiarism/index.js";
import { checkVisualConsistency } from "./gemini_flash_visual_consistency/index.js";
import "dotenv/config";

const BLOCK_THRESHOLD = Number(process.env.FRAUD_RISK_BLOCK_THRESHOLD || 0.75);

function normalizeEvidencePhotos({ imageBuffer, imageBase64, mimeType, images = [] }) {
  const candidates = Array.isArray(images) && images.length > 0 ? images : [{ imageBuffer, imageBase64, mimeType }];

  return candidates
    .map((entry, index) => {
      const fallbackMimeType = entry.mimeType || "image/jpeg";
      const normalizedBase64 = entry.imageBase64 || entry.base64;
      const normalizedBuffer =
        entry.imageBuffer ||
        (normalizedBase64 ? Buffer.from(normalizedBase64, normalizedBase64.startsWith("data:") ? "base64" : "base64") : null);

      if (!normalizedBuffer) {
        return null;
      }

      return {
        imageBuffer: normalizedBuffer,
        imageBase64: normalizedBase64 || "",
        mimeType: fallbackMimeType,
        index,
      };
    })
    .filter(Boolean);
}

function findCrossImageIssues(exifResults) {
  const issues = [];
  const gpsResults = exifResults.filter((result) => result.gps);
  const timestamps = exifResults
    .filter((result) => result.timestamp)
    .map((result) => ({ timestamp: new Date(result.timestamp), imageIndex: result.index }));

  if (gpsResults.length > 1) {
    for (let i = 0; i < gpsResults.length; i += 1) {
      for (let j = i + 1; j < gpsResults.length; j += 1) {
        const lhs = gpsResults[i].gps;
        const rhs = gpsResults[j].gps;

        const distKm = haversineKm(lhs.latitude, lhs.longitude, rhs.latitude, rhs.longitude);
        if (distKm > 2) {
          issues.push(
            `Evidence photo ${i + 1} and photo ${j + 1} are ${distKm.toFixed(1)}km apart, suggesting inconsistent claim evidence.`
          );
        }
      }
    }
  }

  if (timestamps.length > 1) {
    const sorted = [...timestamps].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0].timestamp.getTime();
    const last = sorted[sorted.length - 1].timestamp.getTime();
    const spreadHours = (last - first) / 36e5;

    if (spreadHours > 24) {
      issues.push(
        `Evidence photos span ${spreadHours.toFixed(1)} hours, which is inconsistent with a single event timeline.`
      );
    }
  }

  return {
    issues,
    hardFail: issues.length > 0,
    consistent: issues.length === 0,
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function verifyClaimEvidence({ imageBuffer, imageBase64, mimeType, claimedDamageText, images = [], sessionId }) {
  const evidencePhotos = normalizeEvidencePhotos({ imageBuffer, imageBase64, mimeType, images });

  if (evidencePhotos.length === 0) {
    return {
      fraudRiskScore: 0.35,
      riskCategory: "FLAG_MANUAL_REVIEW",
      shortCircuited: false,
      validationFlags: ["No evidence photo attached — queued for field inspection"],
      layers: { exif: null, webDetection: null, visualConsistency: null },
    };
  }

  // Execute all 3 forensic layers concurrently
  const [exifResults, webResult, visionResult] = await Promise.all([
    Promise.all(
      evidencePhotos.map(async ({ imageBuffer: buffer, imageBase64: base64, mimeType: mediaType }, index) => {
        const exifResult = await checkExifIntegrity(buffer);
        return { ...exifResult, index, imageBase64: base64, mimeType: mediaType };
      })
    ),
    checkReverseImageMatch(evidencePhotos, sessionId),
    checkVisualConsistency({
      imageBase64: evidencePhotos[0].imageBase64,
      mimeType: evidencePhotos[0].mimeType,
      claimedDamageText,
      sessionId,
    }),
  ]);

  const primaryExif = exifResults[0];
  const multiImageConsistency = findCrossImageIssues(exifResults);
  const anyExifHardFail = exifResults.some((result) => result.hardFail);

  const riskAssessment = computeRiskScore({
    exifResult: primaryExif,
    webResult,
    visionResult,
    multiImageConsistency,
    anyExifHardFail,
  });

  const validationFlags = [
    ...primaryExif.reasons,
    ...primaryExif.tamperingIndicators,
    ...primaryExif.metadataWarnings,
    ...(webResult.isLikelyStockOrReused ? [webResult.message || "Possible reused or stock image"] : []),
    ...(visionResult.isLikelyStockOrWebImage
      ? [`Suspected stock/web photo: ${visionResult.webOrStockIndicators?.join(", ") || "web artifacts detected"}`]
      : []),
    ...(visionResult.generativeArtifactsDetected ? ["Possible AI-generated image (synthetic artifacts)"] : []),
    ...(visionResult.discrepancyNotes ? [visionResult.discrepancyNotes] : []),
    ...multiImageConsistency.issues,
  ];

  return {
    fraudRiskScore: riskAssessment.score,
    riskCategory: riskAssessment.category,
    shortCircuited: riskAssessment.hardBlockTriggered,
    validationFlags: [...new Set(validationFlags)].filter(Boolean),
    layers: {
      exif: exifResults,
      webDetection: webResult,
      visualConsistency: visionResult,
      multiImageConsistency,
    },
  };
}

function computeRiskScore({ exifResult, webResult, visionResult, multiImageConsistency, anyExifHardFail }) {
  // If an explicit hard fail occurred (e.g. GPS out of disaster zone, or software editing like Photoshop detected)
  if (anyExifHardFail) {
    return { score: 1.0, category: "HARD_BLOCK", hardBlockTriggered: true };
  }

  let score = 0.05;

  // Layer 1: EXIF signals
  if (exifResult.missingExif) {
    score += 0.22; // Suspicious (common in web downloads / screenshots), flags for review
  } else {
    if (!exifResult.hasGps) score += 0.10;
    if (!exifResult.hasTimestamp) score += 0.06;
  }
  if (exifResult.withinBounds === false) score += 0.35;
  if (exifResult.withinAgeLimit === false) score += 0.25;
  if (exifResult.tamperingIndicators.length > 0) score += 0.30;
  if (exifResult.metadataWarnings.length > 0) score += 0.05;

  // Layer 2: Deduplication / Reverse Match
  if (webResult.isLikelyStockOrReused) {
    score += 0.45; // High fraud signal: recycled claim or web match
  }

  // Layer 3: Gemini Multimodal Forensics
  if (visionResult.isLikelyStockOrWebImage) {
    score += 0.40; // High fraud signal: stock photo, screenshot, or internet image detected
  }
  if (visionResult.generativeArtifactsDetected) {
    score += 0.35; // AI-generated synthetic disaster image
  }
  if (visionResult.consistencyScore != null) {
    score += (1 - visionResult.consistencyScore) * 0.20;
  }

  if (multiImageConsistency?.issues?.length) {
    score += Math.min(multiImageConsistency.issues.length * 0.15, 0.25);
  }

  score = Math.min(Math.max(score, 0), 1);

  let category = "LOW_RISK";
  if (score >= BLOCK_THRESHOLD) category = "HARD_BLOCK";
  else if (score >= 0.35) category = "FLAG_MANUAL_REVIEW";

  return { score: Number(score.toFixed(2)), category, hardBlockTriggered: category === "HARD_BLOCK" };
}

export { BLOCK_THRESHOLD };