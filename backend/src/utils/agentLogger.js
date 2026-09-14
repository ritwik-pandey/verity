/**
 * Agent Telemetry & Visual Console Logger for Verity AI
 * Formats every incoming claim, agent reasoning step, LLM output,
 * fraud verification forensic layer, and payout gate for real-time judge demos.
 */

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  bCyan: "\x1b[96m",
  green: "\x1b[32m",
  bGreen: "\x1b[92m",
  yellow: "\x1b[33m",
  bYellow: "\x1b[93m",
  magenta: "\x1b[35m",
  bMagenta: "\x1b[95m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  bRed: "\x1b[91m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgGreen: "\x1b[42m\x1b[30m",
};

const LINE_WIDTH = 76;
const DIVIDER = "═".repeat(LINE_WIDTH);

export function logPipelineStart(sessionId, rawInput = {}) {
  const text = rawInput.text ? `"${rawInput.text.trim()}"` : "(No text provided)";
  const coords = rawInput.claimedCoords
    ? `Lat ${rawInput.claimedCoords.lat}, Lng ${rawInput.claimedCoords.lng}`
    : "Not provided (local disaster zone assumed)";
  const imgCount = rawInput.images?.length || (rawInput.imageBase64 ? 1 : 0);

  console.log(`\n${C.bCyan}${DIVIDER}${C.reset}`);
  console.log(`${C.bold}${C.bCyan} 🚀 [VERITY AI] NEW DISASTER CLAIM TRIAGE PIPELINE INITIATED${C.reset}`);
  console.log(`${C.gray}    Session ID : ${C.white}${sessionId}${C.reset}`);
  console.log(`${C.gray}    Submitted  : ${C.white}${new Date().toISOString()}${C.reset}`);
  console.log(`${C.gray}    Claim Text : ${C.bYellow}${text}${C.reset}`);
  console.log(`${C.gray}    Location   : ${C.white}${coords}${C.reset}`);
  console.log(`${C.gray}    Evidence   : ${C.white}${imgCount} photo(s) submitted for forensic audit${C.reset}`);
  console.log(`${C.bCyan}${DIVIDER}${C.reset}\n`);
}

export function logIntentAgent({ input, output, latencyMs }) {
  console.log(`${C.bCyan}┌── 🤖 [AGENT 1: INGESTION & INTENT ROUTER] ${"─".repeat(34)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  ⚙️  ${C.bold}Engine${C.reset}   : ${C.magenta}Intent Classification & Sanitizer${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📥 ${C.bold}Input${C.reset}    : ${C.white}"${(input || "").slice(0, 100)}${(input || "").length > 100 ? "..." : ""}"${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Decision${C.reset} : Type: ${C.bGreen}${output?.type || "claim_submission"}${C.reset} (Confidence: ${Math.round((output?.confidence || 1) * 100)}%)`);
  if (output?.reason) {
    console.log(`${C.bCyan}│${C.reset}     Reason   : ${C.gray}${output.reason}${C.reset}`);
  }
  const route = output?.type === "test_verification" ? "testVerification" : "extract (Node 2)";
  console.log(`${C.bCyan}│${C.reset}     Route -> : ${C.bCyan}${route}${C.reset}`);
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logExtractionAgent({ input, model = "Qwen 3.8 27B (Groq)", output, latencyMs, audioSource }) {
  console.log(`${C.bCyan}┌── 🌐 [AGENT 2: DIALECT-NEUTRAL EXTRACTION AGENT] ${"─".repeat(25)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  ⚙️  ${C.bold}Model${C.reset}    : ${C.bMagenta}${model}${C.reset} ${latencyMs ? C.gray + `(${latencyMs}ms)` + C.reset : ""}`);
  console.log(`${C.bCyan}│${C.reset}  📥 ${C.bold}Input (Dialect/Panicked claim)${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}     ${C.bYellow}"${input}"${C.reset}`);
  if (audioSource) {
    console.log(`${C.bCyan}│${C.reset}     ${C.gray}* Transcribed from audio voice note via Whisper Large v3${C.reset}`);
  }
  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Normalized Objective Physical Parameters (JSON Schema)${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}     • Water Depth          : ${C.bCyan}${output?.waterDepthFt != null ? `${output.waterDepthFt} ft` : "Not specified / null"}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}     • Structural Damage    : ${output?.structuralIntegrity === "destroyed" ? C.bRed : output?.structuralIntegrity === "damaged" ? C.bYellow : C.bGreen}${output?.structuralIntegrity?.toUpperCase() || "UNKNOWN"}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}     • Entrapment Status    : ${output?.entrapmentStatus ? C.bRed + "⚠️  TRAPPED (CRITICAL ALERT)" : C.green + "No active entrapment"}${C.reset}`);
  const deps = output?.dependantsAtRisk?.length > 0 ? output.dependantsAtRisk.join(", ") : "None reported";
  console.log(`${C.bCyan}│${C.reset}     • Dependants at Risk   : ${C.white}${deps}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}     • Evacuation Required  : ${output?.evacuationNeeded ? C.bRed + "YES (Immediate Rescue Needed)" : C.green + "No"}${C.reset}`);
  const confPct = Math.round((output?.confidenceScore || 0) * 100);
  console.log(`${C.bCyan}│${C.reset}     • Extraction Confidence: ${confPct >= 70 ? C.bGreen : C.bYellow}${confPct}%${C.reset}`);
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logFraudAgent({ input, output }) {
  console.log(`${C.bCyan}┌── 🛡️  [AGENT: MULTI-LAYER FRAUD & FORENSIC VERIFICATION] ${"─".repeat(17)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  ⚙️  ${C.bold}Layers${C.reset}   : ${C.bMagenta}EXIF Integrity (L1) + Local pHash Deduplication (L2) + Gemini Multimodal (L3)${C.reset}`);
  
  // Layer 1: EXIF
  const primaryExif = Array.isArray(output?.layers?.exif) ? output.layers.exif[0] : output?.layers?.exif;
  const gpsInfo = primaryExif?.hasGps
    ? `${C.green}PASS (${primaryExif.gps.latitude.toFixed(4)}, ${primaryExif.gps.longitude.toFixed(4)}) - In Zone: ${primaryExif.withinBounds !== false ? "YES" : C.bRed + "NO (Out of Bounds)"}${C.reset}`
    : `${C.yellow}No GPS metadata attached${C.reset}`;
  const timeInfo = primaryExif?.hasTimestamp
    ? `${C.green}Recorded: ${primaryExif.timestamp || "Valid"} (Age: ${primaryExif.withinAgeLimit !== false ? "Fresh" : C.bRed + "STALE"})${C.reset}`
    : `${C.yellow}No timestamp metadata${C.reset}`;

  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Forensic Audit Results${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}     ${C.bold}Layer 1 [EXIF Integrity]${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}       • GPS Geofence  : ${gpsInfo}`);
  console.log(`${C.bCyan}│${C.reset}       • Timestamp Age : ${timeInfo}`);
  if (primaryExif?.tamperingIndicators?.length) {
    console.log(`${C.bCyan}│${C.reset}       • ${C.bRed}Software Tampering Detected: ${primaryExif.tamperingIndicators.join(", ")}${C.reset}`);
  }

  // Layer 2: Web / pHash
  const web = output?.layers?.webDetection;
  console.log(`${C.bCyan}│${C.reset}     ${C.bold}Layer 2 [Plagiarism & Deduplication]${C.reset}:`);
  if (!web || web.skipped) {
    console.log(`${C.bCyan}│${C.reset}       • Duplicate/Stock Match: ${C.yellow}SKIPPED (${web?.message || "Not analyzed"})${C.reset}`);
  } else if (web.isLikelyStockOrReused) {
    const matchDetail = web.matchingPages?.length ? ` (${web.matchingPages[0]})` : "";
    console.log(`${C.bCyan}│${C.reset}       • Duplicate/Stock Match: ${C.bRed}⚠️ MATCH DETECTED${matchDetail}${C.reset}`);
  } else {
    console.log(`${C.bCyan}│${C.reset}       • Duplicate/Stock Match: ${C.bGreen}PASSED (${web.message || "Unique Evidence"})${C.reset}`);
  }

  // Layer 3: Gemini Multimodal Vision
  const vision = output?.layers?.visualConsistency;
  if (vision) {
    const consistencyPct = Math.round((vision.consistencyScore || 0) * 100);
    console.log(`${C.bCyan}│${C.reset}     ${C.bold}Layer 3 [Gemini Flash Multimodal Forensics]${C.reset}:`);
    console.log(`${C.bCyan}│${C.reset}       • Visual Consistency: ${consistencyPct >= 70 ? C.bGreen : consistencyPct >= 40 ? C.bYellow : C.bRed}${consistencyPct}% match with text description${C.reset}`);
    console.log(`${C.bCyan}│${C.reset}       • Web/Stock Imagery : ${vision.isLikelyStockOrWebImage ? C.bRed + "DETECTED (Suspected Stock/Web/Screenshot Photo)" : C.green + "None (Authentic Field Photo)"}${C.reset}`);
    if (vision.webOrStockIndicators?.length) {
      console.log(`${C.bCyan}│${C.reset}         ${C.bYellow}└─ Indicators     : ${vision.webOrStockIndicators.join("; ")}${C.reset}`);
    }
    console.log(`${C.bCyan}│${C.reset}       • AI-Gen Artifacts  : ${vision.generativeArtifactsDetected ? C.bRed + "DETECTED (Synthetic Image)" : C.green + "None (Authentic Photo)"}${C.reset}`);
    if (vision.discrepancyNotes) {
      console.log(`${C.bCyan}│${C.reset}       • Forensic Notes    : ${C.white}${vision.discrepancyNotes}${C.reset}`);
    }
  } else {
    console.log(`${C.bCyan}│${C.reset}     ${C.bold}Layer 3 [Gemini Flash Multimodal Forensics]${C.reset}:`);
    console.log(`${C.bCyan}│${C.reset}       • Status            : ${C.yellow}SKIPPED / NOT EXECUTED${C.reset}`);
  }

  // Overall Risk
  const riskScore = (output?.fraudRiskScore || 0).toFixed(2);
  const categoryColor = output?.riskCategory === "HARD_BLOCK" ? C.bRed : output?.riskCategory === "FLAG_MANUAL_REVIEW" ? C.bYellow : C.bGreen;
  console.log(`${C.bCyan}│${C.reset}     ${C.bold}Combined Assessment${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}       • Fraud Risk Score : ${categoryColor}${C.bold}${riskScore} / 1.00 [${output?.riskCategory || "LOW_RISK"}]${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}       • Short-Circuited  : ${output?.shortCircuited ? C.bRed + "YES (Hard Block Triggered)" : C.green + "NO (Proceed to Scorer)"}${C.reset}`);

  if (output?.validationFlags?.length) {
    console.log(`${C.bCyan}│${C.reset}       • Flags            : ${C.yellow}${output.validationFlags.slice(0, 3).join("; ")}${C.reset}`);
  }
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logScoringAgent({ input, output }) {
  console.log(`${C.bCyan}┌── ⚖️  [AGENT 3: SEVERITY & FAST PAYOUT SCORING AGENT] ${"─".repeat(19)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  ⚙️  ${C.bold}Model${C.reset}   : ${C.magenta}Deterministic Disaster Relief Policy Engine${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📥 ${C.bold}Inputs${C.reset}  : Extracted severity factors + Fraud status (${input?.riskCategory || "LOW_RISK"})`);
  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Scoring Decision${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}     • Calculated Severity Score : ${C.bYellow}${C.bold}${output?.severity != null ? `${output.severity} / 100` : "0 (Blocked)"}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}     • Approved Immediate Relief : ${C.bGreen}${C.bold}$${(output?.payout || 0).toLocaleString()}${C.reset} ${C.gray}(Base: $500, Max: $2,000)${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}     • Initial Pipeline Status   : ${C.white}${output?.status || "pending"}${C.reset}`);
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logParityGate({ input, output }) {
  console.log(`${C.bCyan}┌── 🌐 [SAFETY GATE: PRISM PARITY & DEMOGRAPHIC FAIRNESS] ${"─".repeat(17)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  ⚙️  ${C.bold}Evaluator${C.reset}: ${C.magenta}PRISM Real-time Statistical Parity Gate${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📥 ${C.bold}Inputs${C.reset}   : Proposed Grant: $${input?.proposedPayout || 0} | Extracted Factors`);
  const isBlocked = output?.blocked === true;
  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Gate Verdict${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}     • Gate Status      : ${isBlocked ? C.bRed + "BLOCKED FOR PARITY REVIEW" : C.bGreen + "PASSED (No Demographic Disparity)"}${C.reset}`);
  if (output?.reason || output?.evalResult?.reason) {
    console.log(`${C.bCyan}│${C.reset}     • Reason           : ${C.white}${output.reason || output.evalResult.reason}${C.reset}`);
  }
  if (output?.baseline_payout != null || output?.evalResult?.baseline_payout != null) {
    const base = output.baseline_payout ?? output.evalResult.baseline_payout;
    console.log(`${C.bCyan}│${C.reset}     • Baseline Payout  : $${base} (Deviation: ${output?.deviation ?? output?.evalResult?.deviation ?? 0})`);
  }
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logComplianceAgent({ input, output }) {
  console.log(`${C.bCyan}┌── 📋 [AGENT: COMPLIANCE & SAFETY AUDIT] ${"─".repeat(33)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  ⚙️  ${C.bold}Auditor${C.reset} : ${C.magenta}Verity 5-Point Safety & Audit Policy${C.reset}`);
  const statusColor = output?.complianceStatus === "passed" ? C.bGreen : C.bRed;
  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Audit Summary${C.reset}:`);
  console.log(`${C.bCyan}│${C.reset}     • Compliance Score  : ${statusColor}${C.bold}${output?.complianceScore || 0}% [${(output?.complianceStatus || "PASSED").toUpperCase()}]${C.reset}`);
  if (Array.isArray(output?.guardrailsEvaluated)) {
    console.log(`${C.bCyan}│${C.reset}     • Evaluated Guardrails:`);
    for (const g of output.guardrailsEvaluated) {
      const icon = g.status === "passed" ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      console.log(`${C.bCyan}│${C.reset}       ${icon} ${g.name.padEnd(24)} : ${g.status === "passed" ? C.green : C.yellow}${g.outcome || g.status}${C.reset}`);
    }
  }
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logTestVerification({ input, output }) {
  console.log(`${C.bCyan}┌── 🧪 [SYNTHETIC TEST TRACE VERIFICATION] ${"─".repeat(32)}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📥 ${C.bold}Test Input${C.reset}  : ${C.yellow}${input?.text || "test verification trace"}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📤 ${C.bold}Status${C.reset}      : ${C.bGreen}Verified synthetic test run${C.reset}`);
  console.log(`${C.bCyan}└${"─".repeat(LINE_WIDTH - 1)}${C.reset}\n`);
}

export function logPipelineComplete(sessionId, finalState = {}, totalLatencyMs = 0) {
  const statusColor = finalState.status === "verified"
    ? C.bGreen
    : finalState.status === "flagged"
    ? C.bYellow
    : C.bRed;

  console.log(`${C.bGreen}${DIVIDER}${C.reset}`);
  console.log(`${C.bold}${C.bGreen} 🎉 [VERITY AI] CLAIM TRIAGE COMPLETE (Turnaround: ${totalLatencyMs}ms)${C.reset}`);
  console.log(`${C.gray}    Session ID    : ${C.white}${sessionId}${C.reset}`);
  console.log(`${C.gray}    Final Status  : ${statusColor}${C.bold}${(finalState.status || "UNKNOWN").toUpperCase()}${C.reset}`);
  console.log(`${C.gray}    Severity      : ${C.bYellow}${C.bold}${finalState.severity != null ? `${finalState.severity} / 100` : "N/A"}${C.reset}`);
  console.log(`${C.gray}    Approved Grant: ${C.bGreen}${C.bold}$${(finalState.payout || 0).toLocaleString()} USD${C.reset}`);
  console.log(`${C.gray}    Fraud Risk    : ${C.white}${finalState.fraudResult?.fraudRiskScore != null ? (finalState.fraudResult.fraudRiskScore).toFixed(2) : "0.00"} (${finalState.fraudResult?.riskCategory || "LOW_RISK"})${C.reset}`);
  console.log(`${C.gray}    Fairness Gate : ${C.white}${finalState.parityGate?.blocked ? "FLAGGED" : "PASSED"}${C.reset}`);
  console.log(`${C.bGreen}${DIVIDER}${C.reset}\n`);
}

export function logDispatcherAction({ sessionId, action, result }) {
  const isApprove = action === "approve";
  console.log(`\n${C.bYellow}${DIVIDER}${C.reset}`);
  console.log(`${C.bold}${C.bYellow} 👮 [DISPATCHER ACTION] Human-In-The-Loop Decision Executed${C.reset}`);
  console.log(`${C.gray}    Session ID : ${C.white}${sessionId}${C.reset}`);
  console.log(`${C.gray}    Action     : ${isApprove ? C.bGreen + "APPROVED (DISBURSE FUNDS)" : C.bRed + "FLAGGED (ROUTE TO INVESTIGATION)"}${C.reset}`);
  console.log(`${C.gray}    New Status : ${C.white}${isApprove ? "disbursed" : "investigation"}${C.reset}`);
  console.log(`${C.bYellow}${DIVIDER}${C.reset}\n`);
}
