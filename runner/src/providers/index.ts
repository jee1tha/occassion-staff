import { ClaudeCodeProvider } from "./claude-code.ts";
import { CommandProvider } from "./command.ts";
import { OpenAICompatibleProvider } from "./openai-compatible.ts";
import type { Provider, ProviderConfig } from "./types.ts";

export function createProvider(config: ProviderConfig): Provider {
  switch (config.kind) {
    case "claude_code":
      return new ClaudeCodeProvider(config);
    case "openai_compatible":
      return new OpenAICompatibleProvider(config);
    case "command":
      return new CommandProvider(config);
  }
}

export * from "./types.ts";
