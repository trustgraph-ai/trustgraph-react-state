// @ts-nocheck
// React Query hooks for data fetching and mutation management
import { useMutation } from "@tanstack/react-query";

// TrustGraph socket connection for API communication
import { useSocket, useConnectionState } from "@trustgraph/react-provider";
// Notification system for user feedback
import { useNotification } from "../hooks/useNotification";
// Activity tracking for loading states
import { useActivity } from "../hooks/useActivity";
// Session state for flow ID
import { useSessionStore } from "./session";
// Settings for user and collection
import { useSettings } from "./settings";

// Import match type from client library
import { RowEmbeddingsMatch } from "@trustgraph/client";

/**
 * Custom hook for managing row embeddings query operations
 * Provides functionality for executing semantic searches on structured data indexes
 * First converts query text to embeddings, then searches for similar records
 */
export const useRowEmbeddingsQuery = ({ flow }: { flow?: string } = {}) => {
  // Socket connection for API calls
  const socket = useSocket();
  const connectionState = useConnectionState();
  // Notification system for user feedback
  const notify = useNotification();
  // Session state for current flow ID
  const sessionFlowId = useSessionStore((state) => state.flowId);
  // Settings for default collection
  const { settings } = useSettings();

  // Use explicit param if provided, otherwise fall back to session state
  const effectiveFlow = flow ?? sessionFlowId;

  // Only enable operations when socket is connected and ready
  const isSocketReady =
    connectionState?.status === "authenticated" ||
    connectionState?.status === "unauthenticated";

  // Mutation for executing row embeddings queries
  const rowEmbeddingsQueryMutation = useMutation({
    mutationFn: async ({
      query,
      schemaName,
      collection,
      indexName,
      limit,
    }: {
      query: string;
      schemaName: string;
      collection?: string;
      indexName?: string;
      limit?: number;
    }): Promise<RowEmbeddingsMatch[]> => {
      if (!isSocketReady) {
        throw new Error("Socket connection not ready");
      }

      const flowApi = socket.flow(effectiveFlow);

      // First, get embeddings for the query text
      const vectors = await flowApi.embeddings(query);

      // Then query row embeddings with those vectors
      return flowApi.rowEmbeddingsQuery(
        vectors,
        schemaName,
        collection || settings.collection,
        indexName,
        limit || 10
      );
    },
    onError: (err) => {
      console.log("Row embeddings query error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : err?.toString() || "Unknown error";
      notify.error(`Row embeddings query failed: ${errorMessage}`);
    },
    onSuccess: (data) => {
      if (data && data.length > 0) {
        notify.success(`Found ${data.length} matching record${data.length !== 1 ? 's' : ''}`);
      } else {
        notify.info("No matching records found");
      }
    },
  });

  // Show loading indicator for row embeddings query operations
  useActivity(rowEmbeddingsQueryMutation.isPending, "Executing row embeddings query");

  // Return the public API for the hook
  return {
    // Query execution
    executeQuery: rowEmbeddingsQueryMutation.mutate,
    executeQueryAsync: rowEmbeddingsQueryMutation.mutateAsync,

    // Query state
    isExecuting: rowEmbeddingsQueryMutation.isPending,
    error: rowEmbeddingsQueryMutation.error,

    // Results
    matches: rowEmbeddingsQueryMutation.data || [],
    hasResults: (rowEmbeddingsQueryMutation.data?.length || 0) > 0,

    // Reset function to clear previous results
    reset: rowEmbeddingsQueryMutation.reset,

    // Socket readiness
    isReady: isSocketReady,
  };
};
