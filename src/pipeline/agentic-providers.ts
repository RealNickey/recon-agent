/**
 * Multi-provider & multi-model fallback engine powered by official AI SDK providers.
 *
 * Configured Providers:
 * 1. Primary: Nvidia / Kimi K3 (@ai-sdk/openai-compatible)
 * 2. Secondary: OpenRouter with GLM & standard models (@openrouter/ai-sdk-provider)
 * 3. Fallbacks: Groq, Cerebras, Direct OpenAI (@ai-sdk/openai)
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";

export interface ProviderTarget {
  name: string;
  model: string;
  createModel: () => any;
}

export function hasApprovedProvider(): boolean {
  return Boolean(
    process.env.NVIDIA_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}

export function getAvailableProviderTargets(): ProviderTarget[] {
  const targets: ProviderTarget[] = [];

  // 1. Primary: Nvidia / Kimi-K3 via @ai-sdk/openai-compatible
  const nvidiaKey = process.env.NVIDIA_API_KEY || process.env.MOONSHOT_API_KEY;
  if (nvidiaKey) {
    const nvidia = createOpenAICompatible({
      name: "nvidia",
      baseURL: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
      apiKey: nvidiaKey,
    });
    targets.push(
      {
        name: "Nvidia / Kimi (moonshotai/kimi-k3)",
        model: "moonshotai/kimi-k3",
        createModel: () => nvidia("moonshotai/kimi-k3"),
      }
    );
  }

  // 2. Secondary: OpenRouter via @openrouter/ai-sdk-provider (GLM and standard fallbacks)
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    const openrouter = createOpenRouter({
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey: openrouterKey,
    });

    const userModel = process.env.MODEL;
    if (userModel) {
      targets.push({ name: `OpenRouter (${userModel})`, model: userModel, createModel: () => openrouter(userModel) });
    }

    const openRouterModels = [
      "openai/gpt-4o-mini",
      "anthropic/claude-3-5-haiku",
      "meta-llama/llama-3.3-70b-instruct",
      "z-ai/glm-5.2:free",
      "deepseek/deepseek-chat",
    ];

    for (const m of openRouterModels) {
      if (m !== userModel) {
        targets.push({ name: `OpenRouter (${m})`, model: m, createModel: () => openrouter(m) });
      }
    }
  }

  // 3. Groq Provider (Ultra-fast 500+ tok/s if GROQ_API_KEY is available)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groq = createOpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      name: "groq",
    });
    targets.push(
      { name: "Groq (Llama-3.3-70B)", model: "llama-3.3-70b-versatile", createModel: () => groq("llama-3.3-70b-versatile") },
      { name: "Groq (Llama-3.1-8B)", model: "llama-3.1-8b-instant", createModel: () => groq("llama-3.1-8b-instant") }
    );
  }

  // 4. Cerebras Provider (if CEREBRAS_API_KEY is available)
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) {
    const cerebras = createOpenAI({
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: cerebrasKey,
      name: "cerebras",
    });
    targets.push({ name: "Cerebras (Llama-3.3-70B)", model: "llama3.3-70b", createModel: () => cerebras("llama3.3-70b") });
  }

  // 5. Direct OpenAI Provider (if OPENAI_API_KEY is available)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const openai = createOpenAI({
      apiKey: openaiKey,
      name: "openai",
    });
    targets.push({ name: "OpenAI (GPT-4o-mini)", model: "gpt-4o-mini", createModel: () => openai("gpt-4o-mini") });
  }

  return targets;
}

export async function executeWithProviderFallback<T>(
  operation: (target: ProviderTarget) => Promise<T>,
  targets = getAvailableProviderTargets()
): Promise<{ result: T; targetUsed: ProviderTarget; attempts: number }> {
  if (targets.length === 0) {
    throw new Error("No approved AI provider configured. Offline fail-safe active.");
  }
  let lastError: Error | null = null;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    try {
      const result = await operation(target);
      return { result, targetUsed: target, attempts: i + 1 };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.slice(0, 120);
      console.warn(`⚠️ [AI Fallback Warning] Target '${target.name}' failed: "${msg}". Cascading to next available target (${i + 1}/${targets.length})...`);
    }
  }

  throw lastError ?? new Error("All AI providers in fallback chain exhausted");
}
