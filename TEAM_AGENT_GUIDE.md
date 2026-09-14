# Verity (EquityAid) — 3-Person Agent Development & Architecture Guide

This document outlines the architecture, division of labor, improvement roadmap, and testing strategies for a team of 3 developers working in parallel on the Verity AI claim triage system.

---

## 1. System Architecture Overview

The backend is built around a **LangGraph State Machine** (`backend/src/orchestrator/graph.js`) that processes claims sequentially through three primary intelligent agents:

```
Claim Submission (Text + Image)
       │
       ▼
[STATE CONTRACT: state.js]
       │
       ├──► 1. Extraction & Ingestion Agent (Person 1)
       │       • UUID & Timestamp Ingestion
       │       • Dialect-Neutral Extraction (Groq / Qwen)
       │
       ├──► 2. Multi-Layer Fraud Verification Agent (Person 2)
       │       • Layer 1: EXIF Metadata & Geofencing
       │       • Layer 2: Cloud Vision Web Plagiarism Check
       │       • Layer 3: Gemini Multimodal Forensic Check
       │
       └──► 3. Scoring & Fairness Gate Agent (Person 3)
               • Deterministic Severity & Payout Scorer
               • PRISM Parity / Demographic Bias Gate
               • Dispatcher Authorization & Supabase Persistence
```

---

## 2. The Core State Contract (`state.js`)

All agents communicate by reading and updating the shared state schema located at `backend/src/orchestrator/state.js`:

```javascript
export const initialState = {
  sessionId: null,        // Set by Node 1
  rawInput: {
    text: "",
    imageUrl: "",
    claimedCoords: null,
    submittedAt: null,
  },
  extracted: null,       // Node 2 output
  fraudResult: null,     // Fraud tool output
  fraudBlocked: false,   // Short-circuit flag (EXIF fail)
  severity: null,        // Node 3 output (0 - 100)
  payout: null,          // Node 3 output ($500 - $2000)
  parityGate: null,      // PRISM safety evaluation
  status: "pending",     // pending | flagged | verified | disbursed | investigation
};
```

> **Golden Rule for Collaboration:** Never change the shape or data types of existing fields in `state.js` without discussing it with the team. If your agent needs new data, add a new optional property.

---

## 3. Person 1: Ingestion & Dialect-Neutral Extraction Agent

### 📁 Files Owned:
- `backend/src/orchestrator/nodes/node1_raw_ingestion/index.js`
- `backend/src/orchestrator/nodes/node2_dialect_neutral_extraction/index.js`

### 🎯 Mission:
Ensure that **any** disaster victim—regardless of panic level, slang, regional dialect, or language—has their emergency situation translated into identical, objective physical metrics.

### 🚀 High-Impact Improvements to Build:
1. **Multilingual & Dialect Benchmarks:**
   - Expand the prompt with few-shot examples for Spanish, Hindi, AAVE, regional slang, or code-mixed dialects (e.g. Hinglish).
   - Test that identical physical situations phrased colloquially vs. formally produce the exact same JSON.
2. **Audio Voice Note Ingestion:**
   - Add voice transcription using Groq's Whisper API (`whisper-large-v3`) so victims can send voice recordings instead of typing.
3. **Strict JSON Schema & Validation:**
   - Enforce structured outputs using `response_format: { type: "json_object" }` or validate responses using **Zod** to eliminate `JSON.parse` syntax failures.
4. **Extraction Confidence Scoring:**
   - Add a `confidenceScore` (0.0 to 1.0) to the extracted JSON so low-confidence or ambiguous reports can be flagged for human clarification.

### 🧪 Independent Unit Test (Run without starting the full server):
```bash
node -r dotenv/config -e '
import("./src/orchestrator/nodes/node2_dialect_neutral_extraction/index.js").then(async ({ node2DialectNeutralExtraction }) => {
  const state = {
    rawInput: { text: "pani ghutne tak aa gaya hai ghar doob raha hai" }
  };
  const result = await node2DialectNeutralExtraction(state);
  console.log("Extraction Result:", JSON.stringify(result.extracted, null, 2));
});
'
```

---

## 4. Person 2: Multi-Layer Fraud & Forensic Verification Agent

### 📁 Files Owned:
- `backend/src/tools/fraud_verification/index.js`
- `backend/src/tools/fraud_verification/exif_metadata_integrity/index.js`
- `backend/src/tools/fraud_verification/google_cloud_vision_plagiarism/index.js`
- `backend/src/tools/fraud_verification/gemini_flash_visual_consistency/index.js`

### 🎯 Mission:
Detect and block fraudulent claims, recycled internet imagery, AI-generated synthetic disaster images, and geotag spoofing.

### 🚀 High-Impact Improvements to Build:
1. **Dynamic Disaster Geofencing:**
   - Upgrade EXIF from a single radial point (`DISASTER_LAT`/`LNG`) to support polygon bounding boxes or GeoJSON disaster hazard zones.
2. **Metadata Tampering & Software Detection:**
   - Inspect EXIF tags for indicators of software editing (e.g. `Software: Photoshop`, `Canva`, missing camera sensor metadata).
3. **Multi-Image Support:**
   - Accept multiple evidence photos per claim (e.g., interior damage, exterior water line) and verify spatial/temporal consistency between them.
4. **Calibrated Composite Risk Engine:**
   - Replace simple additive scoring with a weighted Bayesian risk engine that assigns explicit severity categories: `LOW_RISK`, `FLAG_MANUAL_REVIEW`, or `HARD_BLOCK`.

### 🧪 Independent Unit Test:
```bash
node -r dotenv/config -e '
import("./src/tools/fraud_verification/index.js").then(async ({ verifyClaimEvidence }) => {
  import("fs").then(async ({ default: fs }) => {
    const imageBuffer = fs.readFileSync("test-image.jpg");
    const result = await verifyClaimEvidence({
      imageBuffer,
      imageBase64: imageBuffer.toString("base64"),
      mimeType: "image/jpeg",
      claimedDamageText: "Flooded house with 3 feet of water"
    });
    console.log("Fraud Analysis:", JSON.stringify(result, null, 2));
  });
});
'
```

---

## 5. Person 3: Scoring, Fairness & Dispatcher Decision Agent

### 📁 Files Owned:
- `backend/src/orchestrator/nodes/node3_severity_payout_scorer/index.js`
- `backend/src/middleware/prismSafety.js`
- `backend/src/config/prism.js`
- `backend/src/controllers/dispatcherController.js`

### 🎯 Mission:
Ensure calculated payouts are mathematically sound, explainable, free from demographic bias, and provide emergency dispatchers with clear decision workflows.

### 🚀 High-Impact Improvements to Build:
1. **Transparent Reasoning / Explainability:**
   - Generate a line-item explanation for the dispatcher UI:
     *`"$1,450 granted: Baseline ($500) + Water Depth 3ft (+$300) + Vulnerable Dependants (+$400) + Evacuation Needed (+$250)."`*
2. **Algorithmic Parity & Bias Mitigation:**
   - Enhance the PRISM gate to track payout parity across zip codes, demographic markers, and language styles to ensure equity.
3. **Three-Tier Human-in-the-Loop (HIL) Routing:**
   - Tier 1: **Auto-Disburse** (Severity $> 70$, Fraud Risk $< 0.15$).
   - Tier 2: **Dispatcher Review** (Borderline fraud $0.15 - 0.74$ or payout $> \$1,800$).
   - Tier 3: **Auto-Flag / Investigation** (Fraud Risk $\ge 0.75$).
4. **Relief Fund Pool Guardrails:**
   - Track total disbursed funds against an allocated disaster pool budget to prevent exhaustion before high-severity victims apply.

### 🧪 Independent Unit Test:
```bash
node -e '
import("./src/orchestrator/nodes/node3_severity_payout_scorer/index.js").then(({ node3SeverityPayoutScorer }) => {
  const mockState = {
    extracted: {
      waterDepthFt: 3,
      structuralIntegrity: "damaged",
      entrapmentStatus: false,
      dependantsAtRisk: ["elderly"],
      evacuationNeeded: true
    },
    fraudResult: { shortCircuited: false, fraudRiskScore: 0.1 }
  };
  console.log("Scoring Result:", node3SeverityPayoutScorer(mockState));
});
'
```

---

## 6. Git Workflow & Collaboration Rules

### Branch Naming:
Each member creates their own feature branch off `backend`:
```bash
git checkout backend
git pull origin backend

# Person 1
git checkout -b feature/extraction-agent

# Person 2
git checkout -b feature/fraud-agent

# Person 3
git checkout -b feature/scoring-fairness
```

### Pull Request Checklist:
- [ ] Only modified files inside your assigned agent directory.
- [ ] Did not break or mutate the `initialState` signature in `state.js`.
- [ ] Ran your agent's independent test snippet successfully.
- [ ] Tested the full pipeline via `POST /api/triage/submit`.

---

## 7. API Testing Quick Reference

### Health Check:
`GET http://localhost:4000/health`

### Submit Claim:
`POST http://localhost:4000/api/triage/submit`
```json
{
  "text": "My residence is inundated with three feet of water; elderly family members require immediate evacuation.",
  "imageBase64": "<BASE_64_STRING>",
  "mimeType": "image/jpeg",
  "claimedCoords": {
    "lat": 29.7604,
    "lng": -95.3698
  }
}
```

### Authorize Disbursement:
`POST http://localhost:4000/api/triage/authorize`
```json
{
  "sessionId": "<SESSION_ID_RETURNED_FROM_SUBMIT>",
  "action": "approve"
}
```

---

## PRISM tracing (do not remove)

This project sends traces to PRISM. Env vars: `PRISMTRACE_API_KEY`,
`PRISMTRACE_PROJECT_ID`, `PRISMTRACE_HOST`.

Tracing is currently wired at: `backend/src/config/prism.js`, `backend/src/orchestrator/graph.js`, `backend/src/orchestrator/nodes/node1_raw_ingestion/index.js`, `backend/src/orchestrator/nodes/node2_dialect_neutral_extraction/index.js`, `backend/src/middleware/prismSafety.js`

**Standing rule.** Whenever you add or change an agent, chain, graph, tool,
retriever, or any entry point that calls a model, wire it to PRISM before you
finish. Unwired code is invisible in the dashboard. If you are unsure whether
something is covered, assume it is not and wire it.

