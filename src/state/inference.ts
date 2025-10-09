import { useMutation } from "@tanstack/react-query";
import { useSocket } from "@trustgraph/react-provider";
import { useSessionStore } from "./session";
import type { Value } from "@trustgraph/client";

export interface GraphRagOptions {
  entityLimit?: number;
  tripleLimit?: number;
  maxSubgraphSize?: number;
  pathLength?: number;
}

export interface GraphRagResult {
  response: string;
  entities: Value[];
}

export interface AgentCallbacks {
  onThink?: (thought: string) => void;
  onObserve?: (observation: string) => void;
  onAnswer?: (answer: string) => void;
  onError?: (error: string) => void;
}

/**
 * Hook providing low-level access to LLM inference services
 * No conversation state or side effects - just the API calls
 */
export const useInference = () => {
  const socket = useSocket();
  const flowId = useSessionStore((state) => state.flowId);

  /**
   * Graph RAG inference with entity discovery
   */
  const graphRagMutation = useMutation({
    mutationFn: async ({
      input,
      options,
      collection,
    }: {
      input: string;
      options?: GraphRagOptions;
      collection: string;
    }): Promise<GraphRagResult> => {
      // Execute Graph RAG request
      const response = await socket.flow(flowId).graphRag(
        input,
        options || {},
        collection
      );

      // Get embeddings for entity discovery
      const embeddings = await socket.flow(flowId).embeddings(input);

      // Query graph embeddings to find entities
      const entities = await socket
        .flow(flowId)
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
    }: {
      systemPrompt: string;
      input: string;
    }): Promise<string> => {
      return await socket.flow(flowId).textCompletion(systemPrompt, input);
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
        const onThink = (thought: string) => {
          callbacks?.onThink?.(thought);
        };

        const onObserve = (observation: string) => {
          callbacks?.onObserve?.(observation);
        };

        const onAnswer = (answer: string) => {
          callbacks?.onAnswer?.(answer);
          resolve(answer);
        };

        const onError = (error: string) => {
          callbacks?.onError?.(error);
          reject(new Error(error));
        };

        socket.flow(flowId).agent(input, onThink, onObserve, onAnswer, onError);
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
