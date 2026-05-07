import { reportSystemPrompt } from "../prompts/index";

export const reportAgentConfig = {
  name: "Report Agent",
  description: "Generates weekly performance summaries",
  agentType: "report" as const,
  systemPrompt: reportSystemPrompt,
  maxSteps: 8,
};
