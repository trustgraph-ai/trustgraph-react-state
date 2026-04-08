/**
 * Hook for managing explainability state during GraphRAG queries
 * Unpacks explain events into structured data with provenance chains
 *
 * Processing strategy:
 * - Events are processed immediately as they arrive
 * - Explain triples are embedded directly in events (no store lookups)
 * - Edge labels are resolved via triple store queries
 * - Edge label resolution + provenance runs in parallel
 * - onUpdate callback fires on every session state change, allowing
 *   callers to sync to external stores (e.g. Zustand)
 */

import { useState, useCallback, useRef } from "react";
import { useSessionStore } from "./session";
import { useProvenance } from "./provenance";
import type { ExplainEvent, Triple } from "@trustgraph/client";
import {
  parseExplainTriples,
  parseEdgeSelectionTriples,
  getTermValue,
  type ExplainabilitySession,
  type QuestionEvent,
  type ExplorationEvent,
  type FocusEvent,
  type SynthesisEvent,
  type SelectedEdge,
} from "../utils/explainability";

export interface UseExplainabilityOptions {
  flow?: string;
  collection?: string;
  /** Trace provenance for selected edges (default: true) */
  traceProvenance?: boolean;
  /** Called on every session state change with the latest session */
  onUpdate?: (session: ExplainabilitySession) => void;
}

export interface UseExplainabilityResult {
  /** Add an explain event (wire this to graphRag callbacks.onExplain) */
  addEvent: (event: ExplainEvent) => void;
  /** Current session data (React state - may lag behind ref) */
  session: ExplainabilitySession;
  /** Ref-backed session that's always immediately up-to-date (no render delay) */
  sessionRef: React.RefObject<ExplainabilitySession>;
  /** Raw events received */
  events: ExplainEvent[];
  /** Whether unpacking is in progress (React state) */
  isUnpacking: boolean;
  /** Ref-backed processing flag - always immediately up-to-date */
  isProcessingRef: React.RefObject<boolean>;
  /** Any error during unpacking */
  error: string | null;
  /** Reset the session */
  reset: () => void;
}

/**
 * Hook for managing explainability during inference
 */
export const useExplainability = (
  options: UseExplainabilityOptions = {}
): UseExplainabilityResult => {
  const {
    flow,
    collection = "default",
    traceProvenance = true,
  } = options;

  const sessionFlowId = useSessionStore((state) => state.flowId);
  const effectiveFlow = flow ?? sessionFlowId;

  const { traceEdgeProvenance, resolveLabel } = useProvenance({
    flow: effectiveFlow,
    collection,
  });

  // Keep onUpdate in a ref so it doesn't break memoisation
  const onUpdateRef = useRef(options.onUpdate);
  onUpdateRef.current = options.onUpdate;

  const [events, setEvents] = useState<ExplainEvent[]>([]);
  const [session, setSession] = useState<ExplainabilitySession>({});
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror session in a ref so it's always immediately readable (no render delay)
  const sessionRef = useRef<ExplainabilitySession>({});

  // Track pending unpack operations
  const unpackQueueRef = useRef<ExplainEvent[]>([]);
  const isProcessingRef = useRef(false);

  /**
   * Resolve a single edge: extract from embedded triples, resolve labels
   */
  const resolveEdge = useCallback(
    async (edgeSelUri: string, allTriples: Triple[]): Promise<SelectedEdge | null> => {
      // Filter embedded triples for this edge selection URI
      const edgeTriples = allTriples.filter(
        (t) => getTermValue(t.s) === edgeSelUri
      );
      const { edge, reasoning } = parseEdgeSelectionTriples(edgeTriples);

      if (!edge) return null;

      const selectedEdge: SelectedEdge = {
        edge,
        reasoning: reasoning || undefined,
      };

      // Kick off label resolution and provenance in parallel
      const [labels, provenanceChains] = await Promise.all([
        // Labels — all 3 in parallel
        Promise.all([
          resolveLabel(edge.s),
          resolveLabel(edge.p),
          resolveLabel(edge.o),
        ]),
        // Provenance
        traceProvenance
          ? traceEdgeProvenance(edge.s, edge.p, edge.o)
          : Promise.resolve([]),
      ]);

      selectedEdge.labels = { s: labels[0], p: labels[1], o: labels[2] };

      if (provenanceChains.length > 0) {
        selectedEdge.sources = provenanceChains.map((c) => c.chain).flat();
      }

      return selectedEdge;
    },
    [resolveLabel, traceProvenance, traceEdgeProvenance]
  );

  /**
   * Unpack a focus event — resolve ALL edges in parallel
   */
  const unpackFocusEvent = useCallback(
    async (focusEvent: FocusEvent, allTriples: Triple[]): Promise<FocusEvent> => {
      // Fire off all edge resolutions concurrently
      const edgePromises = focusEvent.edgeSelectionUris.map(
        (uri) => resolveEdge(uri, allTriples)
      );

      const results = await Promise.all(edgePromises);
      const selectedEdges = results.filter((e): e is SelectedEdge => e !== null);

      return {
        ...focusEvent,
        selectedEdges,
      };
    },
    [resolveEdge]
  );

  /** Helper to update state, ref, and notify caller together */
  const updateSession = useCallback(
    (updater: (prev: ExplainabilitySession) => ExplainabilitySession) => {
      sessionRef.current = updater(sessionRef.current);
      setSession(updater);
      onUpdateRef.current?.(sessionRef.current);
    },
    []
  );

  const AGENT_EVENT_TYPES = new Set([
    "agent-question", "decomposition", "analysis", "reflection", "conclusion",
  ]);

  /**
   * Process a single explain event
   */
  const processEvent = useCallback(
    async (event: ExplainEvent): Promise<void> => {
      // Use embedded triples directly from the event
      const triples = event.explainTriples ?? [];

      // Parse into structured data
      const parsed = parseExplainTriples(event.explainId, event.explainGraph, triples);
      if (!parsed) return;

      if (AGENT_EVENT_TYPES.has(parsed.type)) {
        // Agent event — append to timeline
        updateSession((prev) => ({
          ...prev,
          agentSteps: [...(prev.agentSteps || []), parsed],
        }));
      } else {
        // Graph-RAG event — populate fixed fields
        updateSession((prev) => {
          const next = { ...prev };

          switch (parsed.type) {
            case "question":
              next.question = parsed as QuestionEvent;
              break;
            case "exploration":
              next.exploration = parsed as ExplorationEvent;
              break;
            case "focus":
              next.focus = parsed as FocusEvent;
              break;
            case "synthesis":
              next.synthesis = parsed as SynthesisEvent;
              break;
          }

          return next;
        });

        // For focus events, unpack edges (labels still need store lookup)
        if (parsed.type === "focus") {
          const unpackedFocus = await unpackFocusEvent(parsed as FocusEvent, triples);
          updateSession((prev) => ({
            ...prev,
            focus: unpackedFocus,
          }));
        }
      }
    },
    [unpackFocusEvent, updateSession]
  );

  /**
   * Process the unpack queue
   */
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (unpackQueueRef.current.length === 0) return;

    isProcessingRef.current = true;
    setIsUnpacking(true);

    try {
      while (unpackQueueRef.current.length > 0) {
        const event = unpackQueueRef.current.shift()!;
        await processEvent(event);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }

    isProcessingRef.current = false;
    setIsUnpacking(false);

    // Check if more events were queued during processing (e.g., after a reset)
    if (unpackQueueRef.current.length > 0) {
      processQueue();
    }
  }, [processEvent]);

  /**
   * Add an explain event — immediately queues and starts processing
   */
  const addEvent = useCallback(
    (event: ExplainEvent) => {
      setEvents((prev) => [...prev, event]);
      unpackQueueRef.current.push(event);
      processQueue();
    },
    [processQueue]
  );

  /**
   * Reset the session
   */
  const reset = useCallback(() => {
    setEvents([]);
    setSession({});
    sessionRef.current = {};
    setError(null);
    unpackQueueRef.current = [];
  }, []);

  return {
    addEvent,
    session,
    sessionRef,
    events,
    isUnpacking,
    isProcessingRef,
    error,
    reset,
  };
};

// Re-export types for convenience
export type {
  ExplainabilitySession,
  ExplainEventType,
  StructuredExplainEvent,
  QuestionEvent,
  ExplorationEvent,
  FocusEvent,
  SynthesisEvent,
  SelectedEdge,
  ProvenanceChain,
  ProvenanceChainItem,
  AgentQuestionEvent,
  DecompositionEvent,
  AnalysisEvent,
  ReflectionEvent,
  ConclusionEvent,
} from "../utils/explainability";
