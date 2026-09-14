import { StateGraph, END } from "@langchain/langgraph";
import { node1RawIngestion } from "./nodes/node1_raw_ingestion/index.js";
import { node2DialectNeutralExtraction } from "./nodes/node2_dialect_neutral_extraction/index.js";
import { node3SeverityPayoutScorer } from "./nodes/node3_severity_payout_scorer/index.js";
import { verifyClaimEvidence } from "../tools/fraud_verification/index.js";
import { enforceParityGate } from "../middleware/prismSafety.js";
import { initTrace, appendTraceStep, closeTrace } from "../config/prism.js";
import { initialState } from "./state.js";

async function fraudToolNode(state) {
  const fraudResult = await verifyClaimEvidence({
    imageBuffer: state.rawInput.imageBuffer,
    imageBase64: state.rawInput.imageBase64,
    mimeType: state.rawInput.mimeType,
    claimedDamageText: state.rawInput.text,
    images: state.rawInput.images || [],
  });
  await appendTraceStep(state.sessionId, { step: "fraud_verification", output: fraudResult });
  return { ...state, fraudResult, fraudBlocked: fraudResult.shortCircuited };
}

async function parityGateNode(state) {
  if (state.status === "flagged") return state; // already blocked by fraud
  const gateResult = await enforceParityGate({
    sessionId: state.sessionId,
    extractedParams: state.extracted,
    proposedPayout: state.payout,
  });
  await appendTraceStep(state.sessionId, { step: "parity_gate", output: gateResult });
  return {
    ...state,
    parityGate: gateResult,
    status: gateResult.blocked ? "flagged" : "verified",
  };
}

async function scoringNode(state) {
  const nextState = node3SeverityPayoutScorer(state);
  await appendTraceStep(state.sessionId, {
    step: "severity_payout_scoring",
    model: "verity-scoring-engine",
    output: { severity: nextState.severity, payout: nextState.payout, status: nextState.status },
  });
  return nextState;
}

export function buildGraph() {
  const graph = new StateGraph({ channels: initialState });

  graph.addNode("ingest", node1RawIngestion);
  graph.addNode("extract", node2DialectNeutralExtraction);
  graph.addNode("fraudCheck", fraudToolNode);
  graph.addNode("score", scoringNode);
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
  await initTrace(sessionId, rawInput);
  const finalState = await app.invoke(startState);
  await closeTrace(finalState.sessionId || sessionId, {
    status: finalState.status,
    payout: finalState.payout,
  });
  return finalState;
}