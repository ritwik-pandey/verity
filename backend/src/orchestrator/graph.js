import { StateGraph, END } from "@langchain/langgraph";
import { randomUUID } from "crypto";
import { node1RawIngestion } from "./nodes/node1_raw_ingestion/index.js";
import { node2DialectNeutralExtraction } from "./nodes/node2_dialect_neutral_extraction/index.js";
import { node3SeverityPayoutScorer } from "./nodes/node3_severity_payout_scorer/index.js";
import { verifyClaimEvidence } from "../tools/fraud_verification/index.js";
import { enforceParityGate } from "../middleware/prismSafety.js";
import { appendTraceStep, closeTrace } from "../config/prism.js";
import { initialState } from "./state.js";
import { buildComplianceAudit, buildTestComplianceAudit, classifyIntent } from "../middleware/complianceAudit.js";

async function intentClassificationNode(state) {
  const intent = classifyIntent(state.rawInput);
  await appendTraceStep(state.sessionId, {
    step: "intent_classification",
    output: intent,
    metadata: { intent: intent.type },
  });
  return { ...state, intent };
}

function routeAfterIntent(state) {
  return state.intent?.type === "test_verification" ? "testVerification" : "extract";
}

async function testVerificationNode(state) {
  const compliance = buildTestComplianceAudit(state.intent);
  await appendTraceStep(state.sessionId, {
    step: "compliance_audit",
    output: compliance,
    metadata: { intent: state.intent.type, ...compliance },
  });
  return { ...state, compliance, status: "test_verified" };
}

async function fraudToolNode(state) {
  const fraudResult = await verifyClaimEvidence({
    imageBuffer: state.rawInput.imageBuffer,
    imageBase64: state.rawInput.imageBase64,
    mimeType: state.rawInput.mimeType,
    claimedDamageText: state.rawInput.text,
    images: state.rawInput.images || [],
    sessionId: state.sessionId,
  });
  await appendTraceStep(state.sessionId, {
    step: "fraud_verification",
    output: fraudResult,
    metadata: { riskCategory: fraudResult.riskCategory, fraudRiskScore: fraudResult.fraudRiskScore },
  });
  return { ...state, fraudResult, fraudBlocked: fraudResult.shortCircuited };
}

async function parityGateNode(state) {
  if (state.status === "flagged") {
    const gateResult = { blocked: false, skipped: true, reason: "Skipped because fraud verification blocked the claim." };
    await appendTraceStep(state.sessionId, {
      step: "parity_gate",
      output: gateResult,
      metadata: { blocked: false, skipped: true },
    });
    return { ...state, parityGate: gateResult };
  }
  const gateResult = await enforceParityGate({
    sessionId: state.sessionId,
    extractedParams: state.extracted,
    proposedPayout: state.payout,
  });
  await appendTraceStep(state.sessionId, {
    step: "parity_gate",
    output: gateResult,
    metadata: { blocked: gateResult.blocked },
  });
  return {
    ...state,
    parityGate: gateResult,
    status: gateResult.blocked ? "flagged" : "verified",
  };
}

export function buildGraph() {
  const graph = new StateGraph({ channels: initialState });

  graph.addNode("ingest", node1RawIngestion);
  graph.addNode("classifyIntent", intentClassificationNode);
  graph.addNode("testVerification", testVerificationNode);
  graph.addNode("extract", node2DialectNeutralExtraction);
  graph.addNode("fraudCheck", fraudToolNode);
  graph.addNode("score", node3SeverityPayoutScorer);
  graph.addNode("parityGateCheck", parityGateNode);
  graph.addNode("complianceAudit", complianceAuditNode);

  graph.setEntryPoint("ingest");
  graph.addEdge("ingest", "classifyIntent");
  graph.addConditionalEdges("classifyIntent", routeAfterIntent, {
    testVerification: "testVerification",
    extract: "extract",
  });
  graph.addEdge("testVerification", END);
  graph.addEdge("extract", "fraudCheck");
  graph.addEdge("fraudCheck", "score");
  graph.addEdge("score", "parityGateCheck");
  graph.addEdge("parityGateCheck", "complianceAudit");
  graph.addEdge("complianceAudit", END);

  return graph.compile();
}

export async function runTriagePipeline(rawInput) {
  const startTime = Date.now();
  const app = buildGraph();
  const sessionId = rawInput.sessionId || randomUUID();
  const startState = {
    ...initialState,
    sessionId,
    rawInput: {
      ...rawInput,
      submittedAt: new Date().toISOString(),
    },
  };

  const finalState = await app.invoke(startState);
  const totalLatencyMs = Date.now() - startTime;

  await closeTrace(finalState.sessionId || sessionId, {
    status: finalState.status,
    severity: finalState.severity,
    payout: finalState.payout,
    totalLatencyMs,
    fraudRiskScore: finalState.fraudResult?.fraudRiskScore,
    riskCategory: finalState.fraudResult?.riskCategory,
    parityPass: finalState.parityGate?.evalResult?.pass,
    intent: finalState.intent,
    compliance: finalState.compliance,
    complianceScore: finalState.compliance?.complianceScore,
    complianceStatus: finalState.compliance?.complianceStatus,
    guardrailsEvaluated: finalState.compliance?.guardrailsEvaluated,
    guardrailFlags: finalState.compliance?.guardrailFlags,
    inputSummary: rawInput.text,
  });

  return finalState;
}

async function complianceAuditNode(state) {
  const compliance = buildComplianceAudit(state);
  await appendTraceStep(state.sessionId, {
    step: "compliance_audit",
    output: compliance,
    metadata: { intent: state.intent?.type, ...compliance },
  });
  return {
    ...state,
    compliance,
    status: compliance.complianceStatus === "passed" ? state.status : "blocked",
  };
}
