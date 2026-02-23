// Re-export socket provider so users only need to install @trustgraph/react-state
export {
  SocketProvider,
  SocketContext,
  ConnectionStateContext,
} from "@trustgraph/react-provider";
export type { SocketProviderProps } from "@trustgraph/react-provider";

// Re-export commonly used types from client
export type {
  BaseApi,
  Triple,
  Term,
  IriTerm,
  BlankTerm,
  LiteralTerm,
  TripleTerm,
  ConnectionState,
  StreamingMetadata,
} from "@trustgraph/client";

// Provider and types
export { NotificationProvider } from "./NotificationProvider";
export type { NotificationProviderProps } from "./NotificationProvider";
export type { NotificationHandler } from "./types";

// Hooks
export { useNotification } from "./hooks/useNotification";
export { useActivity } from "./hooks/useActivity";

// Zustand stores
export { useProgressStateStore } from "./state/progress";
export type { ProgressState } from "./state/progress";
export { useSessionStore } from "./state/session";
export type { SessionState } from "./state/session";
export { useConversation } from "./state/conversation";
export type { ConversationState, ChatMode } from "./state/conversation";
export { useWorkbenchStateStore } from "./state/workbench";
export type { WorkbenchState } from "./state/workbench";
export { useLoadStateStore } from "./state/load";
export type { LoadState } from "./state/load";
export { useSearchStateStore } from "./state/search";
export type { SearchState } from "./state/search";

// TanStack Query hooks
export { useSettings } from "./state/settings";
export { useFlows } from "./state/flows";
export { useLibrary } from "./state/library";
export { useTriples } from "./state/triples";
export { useGraphSubgraph } from "./state/graph-query";
export { useGraphEmbeddings } from "./state/graph-embeddings";
export { useVectorSearch } from "./state/vector-search";
export { useEntityDetail } from "./state/entity-query";
export { useInference } from "./state/inference";
export type {
  GraphRagOptions,
  GraphRagResult,
  GraphRagCallbacks,
  TextCompletionCallbacks,
  AgentCallbacks,
} from "./state/inference";
export { useChatSession, useChat } from "./state/chat-session";
export { useStructuredQuery } from "./state/structured-query";
export { useRowEmbeddingsQuery } from "./state/row-embeddings-query";
export { useRowsQuery } from "./state/rows-query";
export { useEmbeddings } from "./state/embeddings";
export { useCollections } from "./state/collections";
export { useNlpQuery } from "./state/nlp-query";
export { useProcessing } from "./state/processing";
export { useAgentTools } from "./state/agent-tools";
export { useMcpTools } from "./state/mcp-tools";
export { usePrompts } from "./state/prompts";
export { useSchemas } from "./state/schemas";
export { useOntologies } from "./state/ontologies";
export type { Ontology, OntologyMetadata } from "./state/ontologies";
export { useKnowledgeCores } from "./state/knowledge-cores";
export { useTokenCosts } from "./state/token-costs";
export { useLLMModels } from "./state/llm-models";
export { useFlowBlueprints, generateFlowBlueprintId } from "./state/flow-blueprints";
export {
  useFlowParameters,
  useParameterValidation,
} from "./state/flow-parameters";
export { useNodeDetails } from "./state/node-details";

// Model types
export type { Entity } from "./model/entity";
export type { Message } from "./model/message";
export type { Settings } from "./model/settings-types";
export {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from "./model/settings-types";
export type { LLMModelParameter, EnumOption } from "./model/llm-models";

// Utility functions
export { fileToBase64, textToBase64 } from "./utils/document-encoding";
export { vectorSearch } from "./utils/vector-search";
export { getTriples, getTermValue, RDFS_LABEL } from "./utils/knowledge-graph";
export type { LabeledTerm, LabeledTriple } from "./utils/knowledge-graph";
export { prepareMetadata, createDocId } from "./model/document-metadata";
export type { DocumentParameters } from "./model/document-metadata";
