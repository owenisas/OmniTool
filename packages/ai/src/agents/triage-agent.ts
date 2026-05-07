import { triageSystemPrompt } from "../prompts/index";

export const triageAgentConfig = {
  name: "Triage Agent",
  description: "Automatically categorizes and assigns new issues",
  agentType: "triage" as const,
  systemPrompt: triageSystemPrompt,
  maxSteps: 5,
};
