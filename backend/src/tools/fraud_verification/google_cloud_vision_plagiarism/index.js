import { imageHash } from "image-hash";
import fs from "fs";
import "dotenv/config";

// In-memory historical claim hash store for cross-claim deduplication
const historicalClaimHashes = [];

let visionClient = null;
let visionClientChecked = false;

async function getVisionClient() {
  if (visionClientChecked) return visionClient;
  visionClientChecked = true;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    try {
      const vision = await import("@google-cloud/vision");
      visionClient = new vision.default.ImageAnnotatorClient();
      console.log(" Google Cloud Vision client initialized with credentials:", credPath);
    } catch (err) {
      console.warn("Failed to initialize Google Cloud Vision client:", err.message);
    }
  }
  return visionClient;
}

function normalizeInputs(imageInputs) {
  const normalized = Array.isArray(imageInputs) ? imageInputs : [imageInputs];

  return normalized
    .map((entry) => {
      if (Buffer.isBuffer(entry)) {
        return { buffer: entry, mimeType: "image/jpeg" };
      }

      if (entry && entry.imageBuffer) {
        return {
          buffer: entry.imageBuffer,
          mimeType: entry.mimeType || "image/jpeg",
        };
      }

      if (entry && entry.data) {
        return {
          buffer: entry.data,
          mimeType: entry.mimeType || "image/jpeg",
        };
      }

      return null;
    })
    .filter(Boolean);
}

function hashImage({ buffer, mimeType }) {
  return new Promise((resolve, reject) => {
    imageHash(
      { ext: mimeType || "image/jpeg", data: buffer },
      16,
      true,
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(data);
      }
    );
  });
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] !== hashB[i]) {
      distance += 1;
    }
  }
  return distance;
}

function analyzeDuplicatePairs(hashes) {
  const duplicatePairs = [];

  for (let i = 0; i < hashes.length; i += 1) {
    for (let j = i + 1; j < hashes.length; j += 1) {
      const distance = hammingDistance(hashes[i].hash, hashes[j].hash);
      if (distance <= 8) {
        duplicatePairs.push({
          left: hashes[i].index + 1,
          right: hashes[j].index + 1,
          distance,
        });
      }
    }
  }

  return duplicatePairs;
}

function checkHistoricalDuplicates(hashes) {
  const historicalMatches = [];

  for (const item of hashes) {
    for (const record of historicalClaimHashes) {
      const distance = hammingDistance(item.hash, record.hash);
      if (distance <= 8) {
        historicalMatches.push({
          imageIndex: item.index + 1,
          matchedSessionId: record.sessionId,
          distance,
          submittedAt: record.timestamp,
        });
      }
    }
  }

  return historicalMatches;
}

export function registerClaimHashes(sessionId, hashes) {
  if (!sessionId || !Array.isArray(hashes)) return;
  for (const h of hashes) {
    if (h?.hash) {
      historicalClaimHashes.push({
        hash: h.hash,
        sessionId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export async function checkReverseImageMatch(imageInputs, sessionId = null) {
  const normalized = normalizeInputs(imageInputs);

  if (normalized.length === 0) {
    return {
      isLikelyStockOrReused: false,
      matchType: "none",
      fullMatchCount: 0,
      partialMatchCount: 0,
      matchingPages: [],
      skipped: true,
      message: "No image input supplied for deduplication analysis.",
    };
  }

  try {
    const hashes = await Promise.all(
      normalized.map(async ({ buffer, mimeType }, index) => ({
        index,
        hash: await hashImage({ buffer, mimeType }),
      }))
    );

    // 1. Check Google Cloud Vision if available
    const gcpClient = await getVisionClient();
    if (gcpClient) {
      try {
        const [gcpRes] = await gcpClient.webDetection({
          image: { content: normalized[0].buffer },
        });
        const web = gcpRes.webDetection;
        const fullMatches = web?.fullMatchingImages || [];
        const partialMatches = web?.partialMatchingImages || [];
        const pages = web?.pagesWithMatchingImages || [];

        const webMatchDetected = fullMatches.length > 0 || partialMatches.length > 0;

        if (webMatchDetected) {
          return {
            isLikelyStockOrReused: true,
            matchType: "web_match",
            analysisMethod: "google_cloud_vision_web",
            fullMatchCount: fullMatches.length,
            partialMatchCount: partialMatches.length,
            matchingPages: pages.slice(0, 5).map((p) => p.url),
            webEntities: (web?.webEntities || []).slice(0, 5).map((e) => e.description),
            skipped: false,
            message: `Google Cloud Vision found ${fullMatches.length} full and ${partialMatches.length} partial matching images on the public web.`,
          };
        }
      } catch (gcpErr) {
        console.warn("Google Cloud Vision webDetection failed, falling back to pHash:", gcpErr.message);
      }
    }

    // 2. Intra-batch duplicate check
    const batchDuplicates = analyzeDuplicatePairs(hashes);

    // 3. Historical cross-claim duplicate check
    const historicalMatches = checkHistoricalDuplicates(hashes);

    // Register these hashes for subsequent claims
    if (sessionId) {
      registerClaimHashes(sessionId, hashes);
    }

    const isReused = batchDuplicates.length > 0 || historicalMatches.length > 0;
    const matchType = historicalMatches.length > 0
      ? "historical_claim_duplicate"
      : batchDuplicates.length > 0
        ? "batch_duplicate"
        : "none";

    const matchingPages = [
      ...batchDuplicates.map(
        ({ left, right, distance }) => `Duplicate in batch: Photo ${left} vs Photo ${right} (pHash distance: ${distance})`
      ),
      ...historicalMatches.map(
        ({ imageIndex, matchedSessionId, distance }) => `Recycled from Claim ${matchedSessionId.slice(0, 8)}... (pHash distance: ${distance})`
      ),
    ];

    let statusMessage = "Local pHash & historical fingerprint generated (unique within claims database).";
    if (historicalMatches.length > 0) {
      statusMessage = `Recycled image alert: photo matches previous Claim ${historicalMatches[0].matchedSessionId.slice(0, 8)}.`;
    } else if (batchDuplicates.length > 0) {
      statusMessage = "Duplicate photos detected within the same submitted claim batch.";
    } else if (normalized.length > 1) {
      statusMessage = "All submitted photos in this claim batch are visually unique.";
    }

    return {
      isLikelyStockOrReused: isReused,
      matchType,
      analysisMethod: "phash_cross_claim_and_batch",
      duplicatePairs: batchDuplicates,
      historicalMatches,
      fullMatchCount: isReused ? 1 : 0,
      partialMatchCount: 0,
      matchingPages,
      skipped: false,
      message: statusMessage,
      inputCount: normalized.length,
      hashes: hashes.map((h) => h.hash),
    };
  } catch (error) {
    console.warn("Deduplication analysis failed:", error.message);
    return {
      isLikelyStockOrReused: false,
      matchType: "none",
      fullMatchCount: 0,
      partialMatchCount: 0,
      matchingPages: [],
      skipped: true,
      message: `Deduplication analysis unavailable (${error.message}); using local fallback.`,
    };
  }
}