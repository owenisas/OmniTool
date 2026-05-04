import { chatSystemPrompt } from "../prompts/index";

export const chatAgentConfig = {
  name: "Chat Assistant",
  description: "General-purpose assistant for querying company data",
  agentType: "chat",
  systemPrompt: chatSystemPrompt,
  maxSteps: 10,
};
