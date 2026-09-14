import { runTriagePipeline } from "../orchestrator/graph.js";
import { supabase } from "../config/supabase.js";

export async function submitClaim(req, res) {
  try {
    const { text, imageBase64, mimeType, claimedCoords, images, isTestTrace } = req.body;

    if (!text || (!imageBase64 && !(Array.isArray(images) && images.length > 0))) {
      return res.status(400).json({ error: "text and at least one image are required" });
    }

    const normalizedImages = Array.isArray(images) && images.length > 0
      ? images.map((entry) => ({
          imageBase64: entry.imageBase64 || entry.base64,
          mimeType: entry.mimeType || mimeType || "image/jpeg",
        }))
      : Array.isArray(imageBase64)
        ? imageBase64.map((entry) => ({
            imageBase64: typeof entry === "string" ? entry : entry.imageBase64,
            mimeType: typeof entry === "string" ? mimeType || "image/jpeg" : entry.mimeType || mimeType || "image/jpeg",
          }))
        : [{ imageBase64, mimeType: mimeType || "image/jpeg" }];

    const primaryImage = normalizedImages[0];
    const imageBuffer = Buffer.from(primaryImage.imageBase64, "base64");

    const finalState = await runTriagePipeline({
      text,
      imageBuffer,
      imageBase64: primaryImage.imageBase64,
      mimeType: primaryImage.mimeType || "image/jpeg",
      claimedCoords,
      isTestTrace: isTestTrace === true,
      images: normalizedImages.map((entry) => ({
        ...entry,
        imageBuffer: Buffer.from(entry.imageBase64, "base64"),
      })),
    });

    await supabase.from("claims").insert({
      session_id: finalState.sessionId,
      status: finalState.status,
      severity: finalState.severity,
      payout: finalState.payout,
      extracted: finalState.extracted,
      fraud_result: finalState.fraudResult,
      parity_gate: finalState.parityGate,
    });

    res.json(finalState);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Pipeline execution failed", details: err.message });
  }
}

export async function authorizeDisbursement(req, res) {
  const { sessionId, action } = req.body; // action: "approve" | "flag"
  const { data, error } = await supabase
    .from("claims")
    .update({ status: action === "approve" ? "disbursed" : "investigation" })
    .eq("session_id", sessionId)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}
