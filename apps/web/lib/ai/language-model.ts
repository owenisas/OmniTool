import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

/** Build NVIDIA NIM base URL from env or default OpenAI-compatible gateway. */
const DEFAULT_NIM_BASE = "https://integrate.api.nvidia.com/v1";

/**
 * Single entrypoint for OmniTool LLM calls.
 * Prefers NVIDIA NIM (OpenAI-compatible, see https://build.nvidia.com/models )
 * when `NVIDIA_API_KEY` is set; otherwise falls back to Anthropic.
 */
export function getOmniLanguageModel() {
  const nvKey = process.env.NVIDIA_API_KEY?.trim();
  if (nvKey) {
    const baseURL =
      process.env.NVIDIA_NIM_BASE_URL?.replace(/\/+$/, "") ||
      DEFAULT_NIM_BASE;
    const nim = createOpenAI({
      apiKey: nvKey,
      baseURL,
    });
    const modelId =
      process.env.NVIDIA_NIM_MODEL?.trim() ||
      "google/gemma-4-31b-it";
    return { provider: "nvidia-nim" as const, model: nim(modelId) };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      provider: "anthropic" as const,
      model: anthropic(
        process.env.ANTHROPIC_MODEL?.trim() ??
          "claude-3-5-sonnet-latest"
      ),
    };
  }

  return null;
}
