import { useMutation } from "@tanstack/react-query";
import { useNotification } from "../hooks/useNotification";
import { useActivity } from "../hooks/useActivity";
import { useConversation } from "./conversation";
import { useInference } from "./inference";
import { useWorkbenchStateStore } from "./workbench";
import { useProgressStateStore } from "./progress";
import { useSettings } from "./settings";
import { RDFS_LABEL } from "../utils/knowledge-graph";
import { Entity } from "../model/entity";
import { useSocket } from "@trustgraph/react-provider";
import { useSessionStore } from "./session";
import type { Triple } from "@trustgraph/client";

/**
 * High-level hook for managing chat sessions
 * Combines conversation state with inference services
 * Handles routing, progress tracking, entity management, and notifications
 */
export const useChatSession = () => {
  const socket = useSocket();
  const notify = useNotification();

  // Conversation state
  const addMessage = useConversation((state) => state.addMessage);
  const setInput = useConversation((state) => state.setInput);
  const chatMode = useConversation((state) => state.chatMode);

  // Progress and activity management
  const addActivity = useProgressStateStore((state) => state.addActivity);
  const removeActivity = useProgressStateStore(
    (state) => state.removeActivity
  );

  // Session and workbench state
  const flowId = useSessionStore((state) => state.flowId);
  const setEntities = useWorkbenchStateStore((state) => state.setEntities);

  // Settings for GraphRAG configuration
  const { settings } = useSettings();

  // Inference services
  const inference = useInference();

  /**
   * Graph RAG chat handling with entity discovery
   */
  const handleGraphRag = async (input: string) => {
    const ragActivity = "Graph RAG: " + input;
    const embActivity = "Find entities: " + input;

    addActivity(ragActivity);

    try {
      // Execute Graph RAG with entity discovery
      const result = await inference.graphRag({
        input,
        options: {
          entityLimit: settings.graphrag.entityLimit,
          tripleLimit: settings.graphrag.tripleLimit,
          maxSubgraphSize: settings.graphrag.maxSubgraphSize,
          pathLength: settings.graphrag.pathLength,
        },
        collection: settings.collection,
      });

      addMessage("ai", result.response);
      removeActivity(ragActivity);

      // Start embeddings activity
      addActivity(embActivity);

      // Get labels for each entity
      const labelPromises = result.entities.map(async (entity) => {
        const labelActivity = "Label " + entity.v;
        addActivity(labelActivity);

        try {
          const triples = await socket
            .flow(flowId)
            .triplesQuery(
              entity,
              { v: RDFS_LABEL, e: true },
              undefined,
              1,
              settings.collection
            );
          removeActivity(labelActivity);
          return triples;
        } catch (err) {
          removeActivity(labelActivity);
          throw err;
        }
      });

      const labelResponses = await Promise.all(labelPromises);

      // Convert graph labels to entity list
      const entityList: Entity[] = labelResponses
        .filter((resp) => resp && resp.length > 0)
        .map((resp: Triple[]) => ({
          label: resp[0].o.v,
          uri: resp[0].s.v,
        }));

      setEntities(entityList);
      removeActivity(embActivity);

      return result.response;
    } catch (error) {
      removeActivity(ragActivity);
      removeActivity(embActivity);
      throw error;
    }
  };

  /**
   * Basic LLM chat handling
   */
  const handleBasicLlm = async (input: string) => {
    const activity = "Text completion: " + input;
    addActivity(activity);

    try {
      const response = await inference.textCompletion({
        systemPrompt:
          "You are a helpful assistant. Provide clear and concise responses.",
        input,
      });

      addMessage("ai", response);
      removeActivity(activity);
      setEntities([]);

      return response;
    } catch (error) {
      removeActivity(activity);
      throw error;
    }
  };

  /**
   * Agent chat handling with streaming responses
   */
  const handleAgent = async (input: string) => {
    const activity = "Agent: " + input;
    addActivity(activity);

    try {
      const response = await inference.agent({
        input,
        callbacks: {
          onThink: (thought) => addMessage("ai", thought, "thinking"),
          onObserve: (observation) =>
            addMessage("ai", observation, "observation"),
          onAnswer: (answer) => addMessage("ai", answer, "answer"),
        },
      });

      removeActivity(activity);
      setEntities([]);

      return response;
    } catch (error) {
      removeActivity(activity);
      throw error;
    }
  };

  /**
   * Main chat mutation handling message submission
   */
  const chatMutation = useMutation({
    mutationFn: async ({ input }: { input: string }) => {
      // Add user message immediately
      addMessage("human", input);

      try {
        let response: string;

        // Route to appropriate handler based on chat mode
        switch (chatMode) {
          case "graph-rag":
            response = await handleGraphRag(input);
            break;
          case "basic-llm":
            response = await handleBasicLlm(input);
            break;
          case "agent":
            response = await handleAgent(input);
            break;
          default:
            throw new Error("Unknown chat mode");
        }

        // Clear input after successful submission
        setInput("");
        return response;
      } catch (error) {
        // Add error message to chat
        const errorMessage =
          error instanceof Error
            ? error.message
            : error?.toString() || "Unknown error";
        addMessage("ai", errorMessage);

        // Clear input even on error
        setInput("");
        throw error;
      }
    },
    onError: (err) => {
      console.log("Chat error:", err);
      notify.error(err.toString());
    },
  });

  // Show loading indicator for chat operations
  useActivity(chatMutation.isPending, "Processing chat message");

  return {
    submitMessage: chatMutation.mutate,
    isSubmitting: chatMutation.isPending,
    submitError: chatMutation.error,
  };
};

// Re-export as useChat for convenience
export const useChat = useChatSession;
