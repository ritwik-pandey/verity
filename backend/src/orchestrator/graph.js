import { StateGraph, END } from "@langchain/langgraph";
import { node1RawIngestion } from "./nodes/node1_raw_ingestion/index.js";
import { node2DialectNeutralExtraction } from "./nodes/node2_dialect_neutral_extraction/index.js";
import { node3SeverityPayoutScorer } from "./nodes/node3_severity_payout_scorer/index.js";
import { verifyClaimEvidence } from "../tools/fraud_verification/index.js";
import { enforceParityGate } from "../middleware/prismSafety.js";
import { closeTrace } from "../config/prism.js";
import { initialState } from "./state.js";

async function fraudToolNode(state) {
  const fraudResult = await verifyClaimEvidence({
    imageBuffer: state.rawInput.imageBuffer,
    imageBase64: state.rawInput.imageBase64,
    mimeType: state.rawInput.mimeType,
    claimedDamageText: state.rawInput.text,
    images: state.rawInput.images || [],
    sessionId: state.sessionId,
  });
  return { ...state, fraudResult, fraudBlocked: fraudResult.shortCircuited };
}

async function parityGateNode(state) {
  if (state.status === "flagged") return state; // already blocked by fraud
  const gateResult = await enforceParityGate({
    sessionId: state.sessionId,
    extractedParams: state.extracted,
    proposedPayout: state.payout,
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
  graph.addNode("extract", node2DialectNeutralExtraction);
  graph.addNode("fraudCheck", fraudToolNode);
  graph.addNode("score", node3SeverityPayoutScorer);
  graph.addNode("parityGateCheck", parityGateNode);

  graph.setEntryPoint("ingest");
  graph.addEdge("ingest", "extract");
  graph.addEdge("extract", "fraudCheck");
  graph.addEdge("fraudCheck", "score");
  graph.addEdge("score", "parityGateCheck");
  graph.addEdge("parityGateCheck", END);

  return graph.compile();
}

export async function runTriagePipeline(rawInput) {
  const startTime = Date.now();
  const app = buildGraph();
  const sessionId = rawInput.sessionId || crypto.randomUUID();
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
    inputSummary: rawInput.text,
  });

  return finalState;
}