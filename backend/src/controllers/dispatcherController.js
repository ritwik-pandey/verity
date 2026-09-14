import { runTriagePipeline } from "../orchestrator/graph.js";
import { supabase } from "../config/supabase.js";

export async function submitClaim(req, res) {
  try {
    const { text, imageBase64, mimeType, claimedCoords } = req.body;
    if (!text || !imageBase64) {
      return res.status(400).json({ error: "text and imageBase64 are required" });
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const finalState = await runTriagePipeline({
      text,
      imageBuffer,
      imageBase64,
      mimeType: mimeType || "image/jpeg",
      claimedCoords,
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