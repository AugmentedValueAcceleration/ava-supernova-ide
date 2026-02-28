import { ContainerModule } from '@theia/core/shared/inversify';

// Backend module for @ava/core integration
// This runs in the Node.js backend process where @ava/core will be imported directly.
//
// Planned responsibilities:
// - Import and initialise @ava/core Agent
// - Expose agent RPC service to the frontend
// - Handle tool execution (file_read, file_write, bash, etc.)
// - Manage provider configuration and API keys
// - Handle conversation history and memory persistence

export default new ContainerModule((bind) => {
  // TODO: Bind AvaAgentService (RPC bridge between frontend panel and @ava/core)
  // bind(AvaAgentService).toSelf().inSingletonScope();
  // bind(ConnectionHandler).toDynamicValue(...)
});
