/**
 * Explainability utilities for parsing and structuring explain events
 */

import type { Triple, Term } from "@trustgraph/client";
import {
  TG,
  TG_QUERY,
  TG_EDGE_COUNT,
  TG_SELECTED_EDGE,
  TG_EDGE,
  TG_REASONING,
  TG_CONTENT,
  PROV_STARTED_AT_TIME,
  PROV_WAS_DERIVED_FROM,
  RDF_TYPE,
  RDFS_LABEL,
} from "@trustgraph/client";

// Agent-specific predicates (not yet in client library)
const TG_ACTION = TG + "action";
const TG_ARGUMENTS = TG + "arguments";
const TG_SUBAGENT_GOAL = TG + "subagentGoal";

// RDF type URIs for agent events
const TG_AGENT_QUESTION = TG + "AgentQuestion";
const TG_ANALYSIS = TG + "Analysis";
const TG_TOOL_USE = TG + "ToolUse";
const TG_OBSERVATION = TG + "Observation";
const TG_THOUGHT_TYPE = TG + "Thought";
const TG_REFLECTION_TYPE = TG + "Reflection";
const TG_CONCLUSION = TG + "Conclusion";
const TG_ANSWER = TG + "Answer";
const TG_FINDING = TG + "Finding";
const TG_SYNTHESIS_TYPE = TG + "Synthesis";
const TG_DECOMPOSITION = TG + "Decomposition";

// ── Graph-RAG event types (existing) ────────────────────────────────

export type ExplainEventType =
  | "question" | "exploration" | "focus" | "synthesis"
  | "agent-question" | "decomposition" | "analysis" | "reflection" | "conclusion"
  | "unknown";

// ── Graph-RAG structured events (existing) ──────────────────────────

export interface QuestionEvent {
  type: "question";
  explainId: string;
  explainGraph: string;
  query?: string;
  timestamp?: string;
}

export interface ExplorationEvent {
  type: "exploration";
  explainId: string;
  explainGraph: string;
  edgeCount?: number;
}

export interface SelectedEdge {
  /** The actual edge as (s, p, o) URIs */
  edge: {
    s: string;
    p: string;
    o: string;
  };
  /** Human-readable labels for the edge */
  labels?: {
    s: string;
    p: string;
    o: string;
  };
  /** LLM's reasoning for selecting this edge */
  reasoning?: string;
  /** Provenance chain to source documents */
  sources?: ProvenanceChainItem[];
}

export interface FocusEvent {
  type: "focus";
  explainId: string;
  explainGraph: string;
  /** URIs of edge selection entities */
  edgeSelectionUris: string[];
  /** Fully resolved selected edges (populated after unpacking) */
  selectedEdges?: SelectedEdge[];
}

export interface SynthesisEvent {
  type: "synthesis";
  explainId: string;
  explainGraph: string;
  /** Content length (full content is streamed separately) */
  contentLength?: number;
}

// ── Agent structured events (new) ───────────────────────────────────

export interface AgentQuestionEvent {
  type: "agent-question";
  explainId: string;
  explainGraph: string;
  query?: string;
  label?: string;
  timestamp?: string;
  derivedFrom?: string[];
}

export interface DecompositionEvent {
  type: "decomposition";
  explainId: string;
  explainGraph: string;
  label?: string;
  goals: string[];
  derivedFrom?: string[];
}

export interface AnalysisEvent {
  type: "analysis";
  explainId: string;
  explainGraph: string;
  label?: string;
  action?: string;
  arguments?: string;
  derivedFrom?: string[];
}

export interface ReflectionEvent {
  type: "reflection";
  explainId: string;
  explainGraph: string;
  label?: string;
  derivedFrom?: string[];
}

export interface ConclusionEvent {
  type: "conclusion";
  explainId: string;
  explainGraph: string;
  label?: string;
  derivedFrom?: string[];
}

// ── Union types ─────────────────────────────────────────────────────

export type StructuredExplainEvent =
  | QuestionEvent
  | ExplorationEvent
  | FocusEvent
  | SynthesisEvent
  | AgentQuestionEvent
  | DecompositionEvent
  | AnalysisEvent
  | ReflectionEvent
  | ConclusionEvent;

// Provenance chain types

export interface ProvenanceChainItem {
  uri: string;
  label: string;
}

export interface ProvenanceChain {
  /** The chain from leaf to root (e.g., chunk → page → document) */
  chain: ProvenanceChainItem[];
  /** The root document URI */
  documentUri?: string;
  /** The root document label/title */
  documentLabel?: string;
}

// Full explainability session data

export interface ExplainabilitySession {
  // Graph-RAG fields
  question?: QuestionEvent;
  exploration?: ExplorationEvent;
  focus?: FocusEvent;
  synthesis?: SynthesisEvent;
  // Agent fields — ordered timeline of events
  agentSteps?: StructuredExplainEvent[];
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract event type from explainId URI (graph-rag only)
 */
export function getEventType(explainId: string): ExplainEventType {
  if (explainId.includes("question")) return "question";
  if (explainId.includes("exploration")) return "exploration";
  if (explainId.includes("focus")) return "focus";
  if (explainId.includes("synthesis")) return "synthesis";
  return "unknown";
}

/**
 * Get term value from a Term object
 */
export function getTermValue(term: Term): string {
  if (!term) return "";
  if (term.t === "i") return term.i || "";
  if (term.t === "l") return term.v || "";
  if (term.t === "t" && term.tr) {
    // Quoted triple - return a serialized form
    const s = getTermValue(term.tr.s);
    const p = getTermValue(term.tr.p);
    const o = getTermValue(term.tr.o);
    return `<<${s} ${p} ${o}>>`;
  }
  return "";
}

/**
 * Extract quoted triple from a Term
 */
export function extractQuotedTriple(term: Term): { s: string; p: string; o: string } | null {
  if (term.t === "t" && term.tr) {
    return {
      s: getTermValue(term.tr.s),
      p: getTermValue(term.tr.p),
      o: getTermValue(term.tr.o),
    };
  }
  return null;
}

// ── Agent event type detection ──────────────────────────────────────

/** Map RDF type URI → agent event type (first match wins) */
const AGENT_TYPE_CHECKS: [string, ExplainEventType][] = [
  [TG_AGENT_QUESTION, "agent-question"],
  [TG_DECOMPOSITION, "decomposition"],
  [TG_ANALYSIS, "analysis"],
  [TG_TOOL_USE, "analysis"],
  [TG_OBSERVATION, "reflection"],
  [TG_THOUGHT_TYPE, "reflection"],
  [TG_REFLECTION_TYPE, "reflection"],
  [TG_CONCLUSION, "conclusion"],
  [TG_FINDING, "conclusion"],
  [TG_SYNTHESIS_TYPE, "conclusion"],
  [TG_ANSWER, "conclusion"],
];

/**
 * Detect event type from RDF types in embedded triples.
 * Returns an agent event type if matched, "unknown" otherwise.
 */
export function getEventTypeFromTriples(triples: Triple[]): ExplainEventType {
  const types = new Set<string>();
  for (const t of triples) {
    if (getTermValue(t.p) === RDF_TYPE) {
      types.add(getTermValue(t.o));
    }
  }

  for (const [typeUri, eventType] of AGENT_TYPE_CHECKS) {
    if (types.has(typeUri)) return eventType;
  }

  return "unknown";
}

/** Extract common fields (label, derivedFrom) from triples */
function extractCommonFields(triples: Triple[]): {
  label?: string;
  derivedFrom: string[];
} {
  const derivedFrom: string[] = [];
  let label: string | undefined;

  for (const t of triples) {
    const p = getTermValue(t.p);
    const o = getTermValue(t.o);
    if (p === RDFS_LABEL && o) label = o;
    if (p === PROV_WAS_DERIVED_FROM && o) derivedFrom.push(o);
  }

  return { label, derivedFrom };
}

// ── Graph-RAG parsers (existing) ────────────────────────────────────

export function parseQuestionTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): QuestionEvent {
  const event: QuestionEvent = {
    type: "question",
    explainId,
    explainGraph,
  };

  for (const triple of triples) {
    const p = getTermValue(triple.p);
    const o = getTermValue(triple.o);

    if (p === TG_QUERY) {
      event.query = o;
    } else if (p === PROV_STARTED_AT_TIME) {
      event.timestamp = o;
    }
  }

  return event;
}

export function parseExplorationTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): ExplorationEvent {
  const event: ExplorationEvent = {
    type: "exploration",
    explainId,
    explainGraph,
  };

  for (const triple of triples) {
    const p = getTermValue(triple.p);
    const o = getTermValue(triple.o);

    if (p === TG_EDGE_COUNT) {
      event.edgeCount = parseInt(o, 10);
    }
  }

  return event;
}

export function parseFocusTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): FocusEvent {
  const event: FocusEvent = {
    type: "focus",
    explainId,
    explainGraph,
    edgeSelectionUris: [],
  };

  for (const triple of triples) {
    const p = getTermValue(triple.p);
    const o = getTermValue(triple.o);

    if (p === TG_SELECTED_EDGE && typeof o === "string") {
      event.edgeSelectionUris.push(o);
    }
  }

  return event;
}

export function parseSynthesisTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): SynthesisEvent {
  const event: SynthesisEvent = {
    type: "synthesis",
    explainId,
    explainGraph,
  };

  for (const triple of triples) {
    const p = getTermValue(triple.p);
    const o = getTermValue(triple.o);

    if (p === TG_CONTENT) {
      event.contentLength = o.length;
    }
  }

  return event;
}

export function parseEdgeSelectionTriples(triples: Triple[]): {
  edge: { s: string; p: string; o: string } | null;
  reasoning: string | null;
} {
  let edge: { s: string; p: string; o: string } | null = null;
  let reasoning: string | null = null;

  for (const triple of triples) {
    const p = getTermValue(triple.p);

    if (p === TG_EDGE) {
      edge = extractQuotedTriple(triple.o);
    } else if (p === TG_REASONING) {
      reasoning = getTermValue(triple.o);
    }
  }

  return { edge, reasoning };
}

// ── Agent parsers (new) ─────────────────────────────────────────────

function parseAgentQuestionTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): AgentQuestionEvent {
  const { label, derivedFrom } = extractCommonFields(triples);
  const event: AgentQuestionEvent = {
    type: "agent-question",
    explainId,
    explainGraph,
    label,
    derivedFrom,
  };

  for (const t of triples) {
    const p = getTermValue(t.p);
    const o = getTermValue(t.o);
    if (p === TG_QUERY) event.query = o;
    if (p === PROV_STARTED_AT_TIME) event.timestamp = o;
  }

  return event;
}

function parseDecompositionTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): DecompositionEvent {
  const { label, derivedFrom } = extractCommonFields(triples);
  const goals: string[] = [];

  for (const t of triples) {
    const p = getTermValue(t.p);
    const o = getTermValue(t.o);
    if (p === TG_SUBAGENT_GOAL && o) goals.push(o);
  }

  return {
    type: "decomposition",
    explainId,
    explainGraph,
    label,
    goals,
    derivedFrom,
  };
}

function parseAnalysisTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): AnalysisEvent {
  const { label, derivedFrom } = extractCommonFields(triples);
  const event: AnalysisEvent = {
    type: "analysis",
    explainId,
    explainGraph,
    label,
    derivedFrom,
  };

  for (const t of triples) {
    const p = getTermValue(t.p);
    const o = getTermValue(t.o);
    if (p === TG_ACTION) event.action = o;
    if (p === TG_ARGUMENTS) event.arguments = o;
  }

  return event;
}

function parseReflectionTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): ReflectionEvent {
  const { label, derivedFrom } = extractCommonFields(triples);
  return {
    type: "reflection",
    explainId,
    explainGraph,
    label,
    derivedFrom,
  };
}

function parseConclusionTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): ConclusionEvent {
  const { label, derivedFrom } = extractCommonFields(triples);
  return {
    type: "conclusion",
    explainId,
    explainGraph,
    label,
    derivedFrom,
  };
}

// ── Unified parser ──────────────────────────────────────────────────

/**
 * Parse triples into a structured event.
 * Tries RDF type detection first (agent events), then URI patterns (graph-rag).
 * Returns null for events with no triples (inner graph-rag plumbing).
 */
export function parseExplainTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): StructuredExplainEvent | null {
  if (triples.length === 0) return null;

  // Try RDF type detection first (agent events with embedded triples)
  const rdfEventType = getEventTypeFromTriples(triples);
  if (rdfEventType !== "unknown") {
    switch (rdfEventType) {
      case "agent-question":
        return parseAgentQuestionTriples(explainId, explainGraph, triples);
      case "decomposition":
        return parseDecompositionTriples(explainId, explainGraph, triples);
      case "analysis":
        return parseAnalysisTriples(explainId, explainGraph, triples);
      case "reflection":
        return parseReflectionTriples(explainId, explainGraph, triples);
      case "conclusion":
        return parseConclusionTriples(explainId, explainGraph, triples);
    }
  }

  // Fall back to URI pattern detection (graph-rag events)
  const eventType = getEventType(explainId);
  switch (eventType) {
    case "question":
      return parseQuestionTriples(explainId, explainGraph, triples);
    case "exploration":
      return parseExplorationTriples(explainId, explainGraph, triples);
    case "focus":
      return parseFocusTriples(explainId, explainGraph, triples);
    case "synthesis":
      return parseSynthesisTriples(explainId, explainGraph, triples);
    default:
      return null;
  }
}
