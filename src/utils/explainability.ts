/**
 * Explainability utilities for parsing and structuring explain events
 */

import type { Triple, Term } from "@trustgraph/client";
import {
  TG_QUERY,
  TG_EDGE_COUNT,
  TG_SELECTED_EDGE,
  TG_EDGE,
  TG_REASONING,
  TG_CONTENT,
  PROV_STARTED_AT_TIME,
  PROV_WAS_DERIVED_FROM,
} from "@trustgraph/client";

// Event types derived from explain_id URI
export type ExplainEventType = "question" | "exploration" | "focus" | "synthesis" | "unknown";

// Structured data for each event type

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

export type StructuredExplainEvent =
  | QuestionEvent
  | ExplorationEvent
  | FocusEvent
  | SynthesisEvent;

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
  question?: QuestionEvent;
  exploration?: ExplorationEvent;
  focus?: FocusEvent;
  synthesis?: SynthesisEvent;
}

/**
 * Extract event type from explainId URI
 * e.g., "urn:trustgraph:question:abc123" → "question"
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

/**
 * Parse triples for a question event
 */
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

/**
 * Parse triples for an exploration event
 */
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

/**
 * Parse triples for a focus event
 */
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

/**
 * Parse triples for a synthesis event
 */
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

/**
 * Parse triples for an edge selection entity
 */
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

/**
 * Parse triples based on event type
 */
export function parseExplainTriples(
  explainId: string,
  explainGraph: string,
  triples: Triple[]
): StructuredExplainEvent | null {
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
