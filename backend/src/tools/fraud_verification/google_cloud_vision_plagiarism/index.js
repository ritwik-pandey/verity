import vision from "@google-cloud/vision";
import fs from "fs";

let client = null;

try {
  if (fs.existsSync("./gcp-vision-key.json")) {
    client = new vision.ImageAnnotatorClient();
  }
} catch (error) {
  console.warn("Google Vision client setup failed:", error.message);
}

export async function checkReverseImageMatch(imageBuffer) {
  if (!client) {
    return {
      isLikelyStockOrReused: false,
      fullMatchCount: 0,
      partialMatchCount: 0,
      matchingPages: [],
      skipped: true,
      message: "Google Vision unavailable; using local fallback.",
    };
  }

  try {
    const [result] = await client.webDetection({ image: { content: imageBuffer } });
    const web = result.webDetection || {};

    const fullMatches = web.fullMatchingImages || [];
    const partialMatches = web.partialMatchingImages || [];
    const pagesWithMatches = web.pagesWithMatchingImages || [];

    return {
      isLikelyStockOrReused: fullMatches.length > 0 || pagesWithMatches.length > 2,
      fullMatchCount: fullMatches.length,
      partialMatchCount: partialMatches.length,
      matchingPages: pagesWithMatches.slice(0, 5).map((p) => p.url),
    };
  } catch (error) {
    console.warn("Google Vision request failed:", error.message);
    return {
      isLikelyStockOrReused: false,
      fullMatchCount: 0,
      partialMatchCount: 0,
      matchingPages: [],
      skipped: true,
      message: `Google Vision unavailable (${error.message}); using local fallback.`,
    };
  }
}