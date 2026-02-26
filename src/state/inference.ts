import { useMutation } from "@tanstack/react-query";
import { useSocket } from "@trustgraph/react-provider";
import { useSessionStore } from "./session";
import type { Term } from "@trustgraph/client";

export interface GraphRagOptions {
  entityLimit?: number;
  tripleLimit?: number;
  maxSubgraphSize?: number;
  pathLength?: number;
}

export interface GraphRagResult {
  response: string;
  entities: Term[];
}

export interface GraphRagCallbacks {
  onChunk?: (chunk: string, complete: boolean) => void;
  onError?: (error: string) => void;
}

export interface TextCompletionCallbacks {
  onChunk?: (chunk: string, complete: boolean) => void;
  onError?: (error: string) => void;
}

export interface AgentCallbacks {
  onThink?: (thought: string, complete?: boolean) => void;
  onObserve?: (observation: string, complete?: boolean) => void;
  onAnswer?: (answer: string, complete?: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * Hook providing low-level access to LLM inference services
 * No conversation state or side effects - just the API calls
 */
export const useInference = ({ flow }: { flow?: string } = {}) => {
  const socket = useSocket();
  const sessionFlowId = useSessionStore((state) => state.flowId);

  // Use explicit param if provided, otherwise fall back to session state
  const effectiveFlow = flow ?? sessionFlowId;

  /**
   * Graph RAG inference with entity discovery
   */
  const graphRagMutation = useMutation({
    mutationFn: async ({
      input,
      options,
      collection,
      callbacks,
    }: {
      input: string;
      options?: GraphRagOptions;
      collection: string;
      callbacks?: GraphRagCallbacks;
    }): Promise<GraphRagResult> => {
      // If callbacks provided, use streaming API
      const response = callbacks
        ? await new Promise<string>((resolve, reject) => {
            let accumulated = "";

            const onChunk = (chunk: string, complete: boolean) => {
              accumulated += chunk;
              callbacks?.onChunk?.(chunk, complete);
              if (complete) {
                resolve(accumulated);
              }
            };

            const onError = (error: string) => {
              callbacks?.onError?.(error);
              reject(new Error(error));
            };

            socket
              .flow(effectiveFlow)
              .graphRagStreaming(input, onChunk, onError, options, collection);
          })
        : await socket.flow(effectiveFlow).graphRag(input, options || {}, collection);

      // Get embeddings for entity discovery
      const embeddings = await socket.flow(effectiveFlow).embeddings(input);

      // Query graph embeddings to find entities
      const entities = await socket
        .flow(effectiveFlow)
        .graphEmbeddingsQuery(
          embeddings,
          options?.entityLimit || 10,
          collection
        );

      return { response, entities };
    },
  });

  /**
   * Basic LLM text completion
   */
  const textCompletionMutation = useMutation({
    mutationFn: async ({
      systemPrompt,
      input,
      callbacks,
    }: {
      systemPrompt: string;
      input: string;
      callbacks?: TextCompletionCallbacks;
    }): Promise<string> => {
      // If callbacks provided, use streaming API
      return callbacks
        ? await new Promise<string>((resolve, reject) => {
            let accumulated = "";

            const onChunk = (chunk: string, complete: boolean) => {
              accumulated += chunk;
              callbacks?.onChunk?.(chunk, complete);
              if (complete) {
                resolve(accumulated);
              }
            };

            const onError = (error: string) => {
              callbacks?.onError?.(error);
              reject(new Error(error));
            };

            socket
              .flow(effectiveFlow)
              .textCompletionStreaming(systemPrompt, input, onChunk, onError);
          })
        : await socket.flow(effectiveFlow).textCompletion(systemPrompt, input);
    },
  });

  /**
   * Agent inference with streaming callbacks
   */
  const agentMutation = useMutation({
    mutationFn: async ({
      input,
      callbacks,
    }: {
      input: string;
      callbacks?: AgentCallbacks;
    }): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        let fullAnswer = "";

        const onThink = (thought: string, complete: boolean) => {
          callbacks?.onThink?.(thought, complete);
        };

        const onObserve = (observation: string, complete: boolean) => {
          callbacks?.onObserve?.(observation, complete);
        };

        const onAnswer = (answer: string, complete: boolean) => {
          fullAnswer += answer;
          callbacks?.onAnswer?.(answer, complete);
          if (complete) {
            resolve(fullAnswer);
          }
        };

        const onError = (error: string) => {
          callbacks?.onError?.(error);
          reject(new Error(error));
        };

        socket
          .flow(effectiveFlow)
          .agent(input, onThink, onObserve, onAnswer, onError);
      });
    },
  });

  return {
    graphRag: graphRagMutation.mutateAsync,
    textCompletion: textCompletionMutation.mutateAsync,
    agent: agentMutation.mutateAsync,
    isLoading:
      graphRagMutation.isPending ||
      textCompletionMutation.isPending ||
      agentMutation.isPending,
  };
};
