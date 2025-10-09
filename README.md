# @trustgraph/react-state

React state management hooks for TrustGraph applications. Provides TanStack Query hooks and Zustand stores for managing application state with a pluggable notification system.

## Features

- 🔌 **Pluggable Notifications** - Component-free notification system with provider pattern
- 📊 **TanStack Query Hooks** - Data fetching and caching for all TrustGraph operations
- 🗃️ **Zustand Stores** - Lightweight state management for UI state
- 🎯 **TypeScript Support** - Full type definitions included
- 🚫 **Zero UI Dependencies** - Bring your own notification/toast UI
- 🔗 **WebSocket Integration** - Works seamlessly with @trustgraph/react-provider

## Installation

```bash
npm install @trustgraph/react-state @trustgraph/react-provider @trustgraph/client
```

## Building from Scratch

New to TrustGraph? Here's how to build your first app from a blank slate.

### 1. Create a new React + TypeScript project

```bash
# Create a new Vite project with React + TypeScript
npm create vite@latest my-trustgraph-app -- --template react-ts
cd my-trustgraph-app
```

### 2. Install TrustGraph dependencies

```bash
# Install TrustGraph packages
npm install @trustgraph/react-state @trustgraph/react-provider @trustgraph/client

# Install required peer dependencies
npm install @tanstack/react-query zustand

# Install a toast/notification library (optional, we'll use console for this example)
```

### 3. Configure WebSocket proxy

The TrustGraph client connects to `ws://HOSTNAME:PORT/api/socket` in your application's address space. You need to proxy this to the TrustGraph API gateway (typically port 8088, path `/api/v1/socket`).

For Vite, create or update `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/socket": {
        target: "ws://localhost:8088",
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/socket/, "/api/v1/socket"),
      },
    },
  },
});
```

**For production deployments**, configure your web server (nginx, Apache, etc.) to proxy `/api/socket` to your TrustGraph API gateway:

```nginx
# nginx example
location /api/socket {
    proxy_pass http://trustgraph-api:8088/api/v1/socket;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### 4. Set up the provider wrapper

Create or update `src/App.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SocketProvider } from "@trustgraph/react-provider";
import { NotificationProvider, NotificationHandler } from "@trustgraph/react-state";
import MyFirstComponent from "./MyFirstComponent";

// Simple console-based notification handler for development
const notificationHandler: NotificationHandler = {
  success: (msg) => console.log("✓", msg),
  error: (msg) => console.error("✗", msg),
  warning: (msg) => console.warn("⚠", msg),
  info: (msg) => console.info("ℹ", msg),
};

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider handler={notificationHandler}>
        <SocketProvider user="my-user" apiKey="">
          <MyFirstComponent />
        </SocketProvider>
      </NotificationProvider>
    </QueryClientProvider>
  );
}

export default App;
```

### 5. Create your first component

Create `src/MyFirstComponent.tsx`:

```typescript
import { useFlows, useSettings } from "@trustgraph/react-state";

function MyFirstComponent() {
  const { flows, isLoading } = useFlows();
  const { settings } = useSettings();

  if (isLoading) return <div>Loading flows...</div>;

  return (
    <div>
      <h1>My TrustGraph App</h1>
      <p>User: {settings.user}</p>
      <p>Collection: {settings.collection}</p>
      <h2>Available Flows:</h2>
      <ul>
        {flows?.map((flow) => (
          <li key={flow.id}>{flow.id}</li>
        ))}
      </ul>
    </div>
  );
}

export default MyFirstComponent;
```

### 6. Run your app

```bash
npm run dev
```

Open http://localhost:5173 and you should see your flows!

### 7. Next Steps

- Add a chat interface with `useConversation` and `useChatSession`
- Query knowledge graphs with `useEntityDetail` and `useGraphSubgraph`
- Upload documents with `useLibrary`
- Perform vector searches with `useVectorSearch`

## Quick Start

### 1. Set up providers

```typescript
import { SocketProvider } from "@trustgraph/react-provider";
import { NotificationProvider, NotificationHandler } from "@trustgraph/react-state";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create your notification handler (example with toast library)
const notificationHandler: NotificationHandler = {
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
  warning: (message) => toast.warning(message),
  info: (message) => toast.info(message),
};

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider handler={notificationHandler}>
        <SocketProvider user="your-user" apiKey="optional-api-key">
          <YourApp />
        </SocketProvider>
      </NotificationProvider>
    </QueryClientProvider>
  );
}
```

### 2. Use state hooks in your components

```typescript
import { useLibrary, useFlows, useSettings } from "@trustgraph/react-state";

function MyComponent() {
  const { documents, deleteDocuments, isLoading } = useLibrary();
  const { flows, startFlow } = useFlows();
  const { settings, updateSetting } = useSettings();

  return (
    <div>
      {isLoading ? "Loading..." : `${documents?.length} documents`}
    </div>
  );
}
```

## Notification System

The package uses a pluggable notification system that allows you to integrate any toast/notification UI library.

### NotificationHandler Interface

```typescript
interface NotificationHandler {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}
```

### Example Implementations

**With Chakra UI:**

```typescript
import { toaster } from "@chakra-ui/react";

const handler: NotificationHandler = {
  success: (msg) => toaster.create({ title: msg, type: "success" }),
  error: (msg) => toaster.create({ title: `Error: ${msg}`, type: "error" }),
  warning: (msg) =>
    toaster.create({ title: `Warning: ${msg}`, type: "warning" }),
  info: (msg) => toaster.create({ title: msg, type: "info" }),
};
```

**With react-hot-toast:**

```typescript
import toast from "react-hot-toast";

const handler: NotificationHandler = {
  success: (msg) => toast.success(msg),
  error: (msg) => toast.error(msg),
  warning: (msg) => toast(msg, { icon: "⚠️" }),
  info: (msg) => toast(msg),
};
```

**With console (testing):**

```typescript
const handler: NotificationHandler = {
  success: (msg) => console.log("✓", msg),
  error: (msg) => console.error("✗", msg),
  warning: (msg) => console.warn("⚠", msg),
  info: (msg) => console.info("ℹ", msg),
};
```

## Available Hooks

### TanStack Query Hooks

#### Document & Library Management

- `useLibrary()` - Manage documents, upload files, submit for processing
- `useProcessing()` - Track document processing status

#### Knowledge Graph Operations

- `useTriples()` - Query RDF triples
- `useGraphSubgraph()` - Retrieve graph subgraphs
- `useGraphEmbeddings()` - Query graph embeddings
- `useVectorSearch()` - Perform vector similarity search
- `useEntityDetail()` - Get entity details
- `useNodeDetails()` - Get node information

#### Flow Management

- `useFlows()` - Manage processing flows
- `useFlowClasses()` - Get available flow classes
- `useFlowParameters()` - Get flow parameter schemas

#### Collections & Organization

- `useCollections()` - Manage document collections
- `useKnowledgeCores()` - Manage knowledge cores

#### Chat & Inference

- `useConversation()` - Chat conversation state (messages, input, mode)
- `useInference()`- Low-level LLM inference (graphRag, textCompletion, agent)
- `useChatSession()` / `useChat()` - High-level chat session management
- `useStructuredQuery()` - Structured query operations
- `useObjectsQuery()` - Object queries
- `useNlpQuery()` - Natural language processing queries

#### Configuration

- `useSettings()` - Application settings management
- `usePrompts()` - Manage prompts
- `useSchemas()` - Manage schemas
- `useOntologies()` - Manage ontologies
- `useLLMModels()` - LLM model configuration
- `useTokenCosts()` - Token cost tracking

#### Tools

- `useAgentTools()` - Agent tool management
- `useMcpTools()` - MCP tool management

#### Utilities

- `useEmbeddings()` - Generate text embeddings

### Zustand Stores

- `useProgressStateStore()` - Activity indicators and error state
- `useSessionStore()` - Session and flow state
- `useConversation()` - Chat conversation state (messages, input, chat mode)
- `useWorkbenchStateStore()` - Workbench UI state (selected entity, tool, etc.)
- `useLoadStateStore()` - Document loading state
- `useSearchStateStore()` - Search results state

### Utility Hooks

- `useNotification()` - Access notification handler
- `useActivity()` - Show/hide activity indicators

## Example Usage

### Managing Documents

```typescript
import { useLibrary, useSettings } from "@trustgraph/react-state";

function DocumentManager() {
  const { settings } = useSettings();
  const {
    documents,
    isLoading,
    deleteDocuments,
    uploadFiles,
    submitDocuments,
  } = useLibrary();

  const handleDelete = (ids: string[]) => {
    deleteDocuments({
      ids,
      onSuccess: () => console.log("Deleted successfully"),
    });
  };

  const handleUpload = (files: File[]) => {
    uploadFiles({
      files,
      params: { title: "My Document", keywords: [] },
      mimeType: "application/pdf",
      onSuccess: () => console.log("Uploaded successfully"),
    });
  };

  const handleSubmit = (ids: string[]) => {
    submitDocuments({
      ids,
      flow: "my-flow",
      tags: ["important"],
      collection: settings.collection,
      onSuccess: () => console.log("Submitted for processing"),
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {documents?.map((doc) => (
        <div key={doc.id}>{doc.title}</div>
      ))}
    </div>
  );
}
```

### Settings Management

```typescript
import { useSettings } from "@trustgraph/react-state";

function SettingsPanel() {
  const { settings, updateSetting, saveSettings, exportSettings } = useSettings();

  return (
    <div>
      <input
        value={settings.user}
        onChange={(e) => updateSetting("user", e.target.value)}
      />
      <input
        value={settings.collection}
        onChange={(e) => updateSetting("collection", e.target.value)}
      />
      <button onClick={() => console.log(exportSettings())}>
        Export Settings
      </button>
    </div>
  );
}
```

### Chat Interface (3-Hook Architecture)

The chat system is split into three composable hooks:

```typescript
import { useConversation, useInference, useChatSession, useSettings } from "@trustgraph/react-state";

// Option 1: High-level chat (easiest)
function SimpleChatUI() {
  const messages = useConversation((state) => state.messages);
  const input = useConversation((state) => state.input);
  const setInput = useConversation((state) => state.setInput);
  const { submitMessage, isSubmitting } = useChatSession();

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.role}: {msg.text}</div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={() => submitMessage({ input })} disabled={isSubmitting}>
        Send
      </button>
    </div>
  );
}

// Option 2: Low-level inference (for custom UIs)
function CustomInferenceUI() {
  const { settings } = useSettings();
  const inference = useInference();
  const [result, setResult] = useState("");

  const handleQuery = async () => {
    const response = await inference.graphRag({
      input: "What is TrustGraph?",
      options: {
        entityLimit: 10,
        tripleLimit: 10,
      },
      collection: settings.collection,
    });
    setResult(response.response);
  };

  return (
    <div>
      <button onClick={handleQuery}>Query</button>
      <div>{result}</div>
    </div>
  );
}
```

### Multi-Collection Apps

Query multiple collections side-by-side:

```typescript
import { useEntityDetail, useSessionStore, useSettings } from "@trustgraph/react-state";

function MultiCollectionView({ entityUri }: { entityUri: string }) {
  const flowId = useSessionStore((state) => state.flowId);
  const { settings } = useSettings();

  // Query same entity from different collections
  const prodData = useEntityDetail(entityUri, flowId, "production");
  const stagingData = useEntityDetail(entityUri, flowId, "staging");
  const defaultData = useEntityDetail(entityUri, flowId, settings.collection);

  return (
    <div>
      <div>
        <h3>Production</h3>
        {prodData.detail?.triples.length} triples
      </div>
      <div>
        <h3>Staging</h3>
        {stagingData.detail?.triples.length} triples
      </div>
      <div>
        <h3>Default ({settings.collection})</h3>
        {defaultData.detail?.triples.length} triples
      </div>
    </div>
  );
}
```

### Using Progress Indicators

```typescript
import { useProgressStateStore, useActivity } from "@trustgraph/react-state";

function MyComponent() {
  const [isLoading, setIsLoading] = useState(false);

  // Automatically shows "Processing data" in activity indicators while isLoading is true
  useActivity(isLoading, "Processing data");

  // Access all current activities
  const activities = useProgressStateStore((state) => state.activity);

  return (
    <div>
      {activities.size > 0 && (
        <div>Active: {Array.from(activities).join(", ")}</div>
      )}
    </div>
  );
}
```

## Common Patterns

### Handling Settings Loading State

Settings are loaded asynchronously. Always check `isLoaded` before accessing settings values:

```typescript
import { useSettings, useEntityDetail } from "@trustgraph/react-state";

function EntityView({ entityUri }: { entityUri: string }) {
  const { settings, isLoaded } = useSettings();
  const flowId = useSessionStore((state) => state.flowId);

  // Wait for settings to load before querying
  const { detail } = useEntityDetail(
    entityUri,
    flowId,
    settings?.collection || "default"
  );

  if (!isLoaded) {
    return <div>Loading settings...</div>;
  }

  return <div>{detail?.triples.length} triples</div>;
}
```

### Using Default Collection from Settings

Most hooks require an explicit `collection` parameter. Use settings as the default source:

```typescript
import { useSettings, useLibrary } from "@trustgraph/react-state";

function DocumentSubmit() {
  const { settings } = useSettings();
  const library = useLibrary();

  const handleSubmit = (ids: string[], flow: string) => {
    library.submitDocuments({
      ids,
      flow,
      tags: ["important"],
      collection: settings?.collection || "default", // Use settings with fallback
      onSuccess: () => console.log("Submitted"),
    });
  };

  return <button onClick={() => handleSubmit(["doc1"], "flow1")}>Submit</button>;
}
```

### Querying Multiple Collections

Override the default collection to query multiple collections side-by-side:

```typescript
import { useEntityDetail, useSettings } from "@trustgraph/react-state";

function MultiCollectionComparison({ entityUri }: { entityUri: string }) {
  const { settings } = useSettings();
  const flowId = useSessionStore((state) => state.flowId);

  // Query same entity from different collections
  const prod = useEntityDetail(entityUri, flowId, "production");
  const staging = useEntityDetail(entityUri, flowId, "staging");
  const defaultData = useEntityDetail(entityUri, flowId, settings?.collection || "default");

  return (
    <div>
      <h3>Production: {prod.detail?.triples.length} triples</h3>
      <h3>Staging: {staging.detail?.triples.length} triples</h3>
      <h3>Default: {defaultData.detail?.triples.length} triples</h3>
    </div>
  );
}
```

### Composing Inference and Conversation Hooks

For custom chat UIs, compose the low-level hooks directly:

```typescript
import { useConversation, useInference, useSettings } from "@trustgraph/react-state";

function CustomChatUI() {
  const messages = useConversation((state) => state.messages);
  const input = useConversation((state) => state.input);
  const setInput = useConversation((state) => state.setInput);
  const addMessage = useConversation((state) => state.addMessage);

  const { settings } = useSettings();
  const inference = useInference();

  const handleSubmit = async () => {
    addMessage("user", input);
    setInput("");

    const result = await inference.graphRag({
      input,
      options: { entityLimit: 10, tripleLimit: 10 },
      collection: settings?.collection || "default",
    });

    addMessage("ai", result.response);
  };

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.role}: {msg.text}</div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSubmit}>Send</button>
    </div>
  );
}
```

## Type Exports

The package re-exports types from `@trustgraph/client` for convenience:

```typescript
import type {
  Triple,
  Value,
  Entity,
  Message,
  Settings,
  NotificationHandler,
  // ... and more
} from "@trustgraph/react-state";
```

## Utility Functions

The package also exports utility functions:

```typescript
import {
  fileToBase64,
  textToBase64,
  vectorSearch,
  getTriples,
  prepareMetadata,
  createDocId,
} from "@trustgraph/react-state";
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run linting
npm run lint

# Type checking
npm run typecheck
```

## Dependencies

### Peer Dependencies (required in your app)

- `react` ^18.0.0
- `@tanstack/react-query` ^5.0.0
- `@trustgraph/client` ^0.1.0
- `@trustgraph/react-provider` ^0.1.0
- `zustand` ^4.0.0 || ^5.0.0

### Runtime Dependencies

- `compute-cosine-similarity` - Vector similarity calculations
- `uuid` - Unique ID generation

## License

Apache 2.0

(c) KnowNext Inc., KnowNext Limited 2025
