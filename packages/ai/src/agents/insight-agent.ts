import { insightSystemPrompt } from "../prompts/index";

export const insightAgentConfig = {
  name: "Insight Agent",
  description: "Analyzes performance data and surfaces trends",
  agentType: "insight" as const,
  systemPrompt: insightSystemPrompt,
  maxSteps: 10,
};
