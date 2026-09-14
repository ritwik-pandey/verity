import { imageHash } from "image-hash";

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

  return {
    duplicatePairs,
    fullMatchCount: duplicatePairs.length,
    partialMatchCount: 0,
    isLikelyStockOrReused: duplicatePairs.length > 0,
    matchingPages: duplicatePairs.map(
      ({ left, right, distance }) => `Image ${left} vs Image ${right} (pHash distance ${distance})`
    ),
  };
}

export async function checkReverseImageMatch(imageInputs) {
  const normalized = normalizeInputs(imageInputs);

  if (normalized.length === 0) {
    return {
      isLikelyStockOrReused: false,
      fullMatchCount: 0,
      partialMatchCount: 0,
      matchingPages: [],
      skipped: true,
      message: "No image input supplied for local pHash analysis.",
    };
  }

  try {
    const hashes = await Promise.all(
      normalized.map(async ({ buffer, mimeType }, index) => ({
        index,
        hash: await hashImage({ buffer, mimeType }),
      }))
    );

    const duplicateAnalysis = analyzeDuplicatePairs(hashes);

    return {
      ...duplicateAnalysis,
      skipped: false,
      message:
        normalized.length > 1
          ? "Local pHash duplicate analysis completed for the submitted evidence set."
          : "Local pHash hash generated; no external web-match dataset was used.",
      inputCount: normalized.length,
    };
  } catch (error) {
    console.warn("Local pHash analysis failed:", error.message);
    return {
      isLikelyStockOrReused: false,
      fullMatchCount: 0,
      partialMatchCount: 0,
      matchingPages: [],
      skipped: true,
      message: `Local pHash analysis unavailable (${error.message}); using local fallback.`,
    };
  }
}