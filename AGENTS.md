# Agent Instructions & Guidelines

## PRISM tracing (do not remove)

This project sends traces to PRISM. Env vars: `PRISMTRACE_API_KEY`,
`PRISMTRACE_PROJECT_ID`, `PRISMTRACE_HOST`.

Tracing is currently wired at: `backend/src/config/prism.js`, `backend/src/orchestrator/graph.js`, `backend/src/orchestrator/nodes/node1_raw_ingestion/index.js`, `backend/src/orchestrator/nodes/node2_dialect_neutral_extraction/index.js`, `backend/src/middleware/prismSafety.js`

**Standing rule.** Whenever you add or change an agent, chain, graph, tool,
retriever, or any entry point that calls a model, wire it to PRISM before you
finish. Unwired code is invisible in the dashboard. If you are unsure whether
something is covered, assume it is not and wire it.
