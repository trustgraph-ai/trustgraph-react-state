import { useQuery } from "@tanstack/react-query";

import { useSocket } from "@trustgraph/react-provider";
import { useNotification } from "../hooks/useNotification";
import { useActivity } from "../hooks/useActivity";
import { useSettings } from "./settings";

/**
 * Custom hook for managing token cost operations
 * Provides functionality for fetching, deleting, and updating token costs
 * for AI models
 * @returns {Object} Token cost state and operations
 */
export const useGraphEmbeddings = ({ flow, vecs, limit, collection }: {
  flow?: string;
  vecs: number[][];
  limit: number;
  collection?: string;
}): {
  graphEmbeddings: any;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} => {
  // WebSocket connection for communicating with the configuration service
  const socket = useSocket();

  // Hook for displaying user notifications
  const notify = useNotification();

  // Settings for default collection
  const { settings } = useSettings();

  if (!flow) flow = "default";

  /**
   * Query for fetching graph embeddings
   * Uses React Query for caching and background refetching
   */
  const query = useQuery({
    queryKey: ["graph-embeddings", { vecs, limit }],
    queryFn: () => {
      return socket
        .flow(flow)
        .graphEmbeddingsQuery(vecs, limit, collection || settings.collection)
        .then((x) => {
          return x;
        })
        .catch((err: unknown) => {
          console.log("Error:", err);
          const message = err instanceof Error ? err.message : String(err);
          notify.error(message);
          throw err;
        });
    },
  });

  // Show loading indicators for long-running operations
  useActivity(query.isLoading, "Loading graph embeddings");

  // Return token cost state and operations for use in components
  return {
    // Token cost query state
    graphEmbeddings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,

    // Manual refetch function
    refetch: query.refetch,
  };
};
