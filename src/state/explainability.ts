/**
 * Hook for managing explainability state during GraphRAG queries
 * Unpacks explain events into structured data with provenance chains
 *
 * Processing strategy:
 * - Events are processed immediately as they arrive
 * - Main event nodes (question, exploration, focus, synthesis) use
 *   stability-based retry: fetch until count > 0 AND stable
 * - Edge sub-objects use simple retry-until-non-empty (fast)
 * - All edge fetching + label resolution + provenance runs in parallel
 */

import { useState, useCallback, useRef } from "react";
import { useSocket, useConnectionState } from "@trustgraph/react-provider";
import { useSessionStore } from "./session";
import { useProvenance } from "./provenance";
import type { ExplainEvent, Triple } from "@trustgraph/client";
import {
  getEventType,
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

  const socket = useSocket();
  const connectionState = useConnectionState();
  const sessionFlowId = useSessionStore((state) => state.flowId);
  const effectiveFlow = flow ?? sessionFlowId;

  const { traceEdgeProvenance, resolveLabel } = useProvenance({
    flow: effectiveFlow,
    collection,
  });

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
   * Check if connected
   */
  const isConnected = useCallback(() => {
    return (
      connectionState?.status === "authenticated" ||
      connectionState?.status === "unauthenticated"
    );
  }, [connectionState]);

  /**
   * Single triple query (no retry)
   */
  const fetchTriples = useCallback(
    async (explainId: string, explainGraph?: string): Promise<Triple[]> => {
      return socket
        .flow(effectiveFlow)
        .triplesQuery(
          { t: "i", i: explainId },
          undefined,
          undefined,
          100,
          collection,
          explainGraph
        );
    },
    [socket, effectiveFlow, collection]
  );

  /**
   * Stability-based retry for main event nodes.
   * Retries until: count > 0 AND count matches previous fetch.
   * Used for question, exploration, focus, synthesis nodes where the
   * backend may write multiple triples incrementally.
   */
  const queryWithStabilityRetry = useCallback(
    async (explainId: string, explainGraph?: string, timeoutMs: number = 5000): Promise<Triple[]> => {
      if (!isConnected()) return [];

      const retryDelay = 500;
      const maxAttempts = Math.ceil(timeoutMs / retryDelay) + 1;
      let prevCount = -1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const triples = await fetchTriples(explainId, explainGraph);
          const count = triples.length;

          if (count > 0 && count === prevCount) {
            return triples;
          }

          prevCount = count;

          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, retryDelay));
          }
        } catch (err) {
          console.error("[explain] triple query failed:", explainId, err);
          return [];
        }
      }

      // Return last fetch if we got anything
      if (prevCount > 0) {
        try {
          return await fetchTriples(explainId, explainGraph);
        } catch {
          return [];
        }
      }

      return [];
    },
    [fetchTriples, isConnected]
  );

  /**
   * Simple retry-until-non-empty for sub-objects (edge selections).
   * These are small atomic writes — either fully there or not yet.
   */
  const queryWithSimpleRetry = useCallback(
    async (explainId: string, explainGraph?: string, timeoutMs: number = 5000): Promise<Triple[]> => {
      if (!isConnected()) return [];

      const retryDelay = 300;
      const maxAttempts = Math.ceil(timeoutMs / retryDelay) + 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const triples = await fetchTriples(explainId, explainGraph);
          if (triples.length > 0) return triples;

          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, retryDelay));
          }
        } catch (err) {
          console.error("[explain] triple query failed:", explainId, err);
          return [];
        }
      }

      return [];
    },
    [fetchTriples, isConnected]
  );

  /**
   * Resolve a single edge: fetch triples, labels, and provenance in parallel
   */
  const resolveEdge = useCallback(
    async (edgeSelUri: string, explainGraph: string): Promise<SelectedEdge | null> => {
      const triples = await queryWithSimpleRetry(edgeSelUri, explainGraph);
      const { edge, reasoning } = parseEdgeSelectionTriples(triples);

      if (!edge) return null;

      const selectedEdge: SelectedEdge = {
        edge,
        reasoning: reasoning || undefined,
      };

      // Kick off labels and provenance in parallel
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
    [queryWithSimpleRetry, resolveLabel, traceProvenance, traceEdgeProvenance]
  );

  /**
   * Unpack a focus event — resolve ALL edges in parallel
   */
  const unpackFocusEvent = useCallback(
    async (focusEvent: FocusEvent): Promise<FocusEvent> => {
      // Fire off all edge resolutions concurrently
      const edgePromises = focusEvent.edgeSelectionUris.map(
        (uri) => resolveEdge(uri, focusEvent.explainGraph)
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

  /** Helper to update both state and ref together */
  const updateSession = useCallback(
    (updater: (prev: ExplainabilitySession) => ExplainabilitySession) => {
      sessionRef.current = updater(sessionRef.current);
      setSession(updater);
    },
    []
  );

  /**
   * Process a single explain event
   */
  const processEvent = useCallback(
    async (event: ExplainEvent): Promise<void> => {
      // Query triples for main event node (stability retry)
      const triples = await queryWithStabilityRetry(event.explainId, event.explainGraph);

      // Parse into structured data
      const parsed = parseExplainTriples(event.explainId, event.explainGraph, triples);
      if (!parsed) return;

      // Update session based on event type
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
            // Will be updated again after unpacking
            next.focus = parsed as FocusEvent;
            break;
          case "synthesis":
            next.synthesis = parsed as SynthesisEvent;
            break;
        }

        return next;
      });

      // For focus events, unpack edges in parallel
      if (parsed.type === "focus") {
        const unpackedFocus = await unpackFocusEvent(parsed as FocusEvent);
        updateSession((prev) => ({
          ...prev,
          focus: unpackedFocus,
        }));
      }
    },
    [queryWithStabilityRetry, unpackFocusEvent, updateSession]
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
  QuestionEvent,
  ExplorationEvent,
  FocusEvent,
  SynthesisEvent,
  SelectedEdge,
  ProvenanceChain,
  ProvenanceChainItem,
} from "../utils/explainability";
