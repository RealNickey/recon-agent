/**
 * Multi-provider & multi-model fallback engine powered by official AI SDK providers.
 *
 * Configured Priority Hierarchy:
 * 1. Primary: Kimi from NIM / Nvidia (@ai-sdk/openai-compatible)
 * 2. Secondary: OpenRouter GLM models (@openrouter/ai-sdk-provider)
 * 3. Fallback: Smartest remaining frontier models (Claude 3.5/3.7 Sonnet, GPT-4o, DeepSeek R1, Llama 3.3 70B, Groq, Cerebras)
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
    process.env.NIM_API_KEY ||
    process.env.NVIDIA_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.CEREBRAS_API_KEY
  );
}

export function getAvailableProviderTargets(): ProviderTarget[] {
  const targets: ProviderTarget[] = [];

  // 1. Primary: Kimi from NIM (NVIDIA NIM via @ai-sdk/openai-compatible)
  const nimKey = process.env.NIM_API_KEY || process.env.NVIDIA_API_KEY || process.env.MOONSHOT_API_KEY;
  if (nimKey) {
    const baseURL = process.env.NIM_BASE_URL || process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
    const nim = createOpenAICompatible({
      name: "nim",
      baseURL,
      apiKey: nimKey,
    });

    const userNimModel = process.env.NIM_MODEL || process.env.NVIDIA_MODEL;
    if (userNimModel) {
      targets.push({
        name: `NIM / Kimi (${userNimModel})`,
        model: userNimModel,
        createModel: () => nim(userNimModel),
      });
    }

    const nimKimiModels = [
      "moonshotai/kimi-k3",
      "moonshotai/kimi-k1.5-preview",
    ];

    for (const m of nimKimiModels) {
      if (m !== userNimModel) {
        targets.push({
          name: `NIM / Kimi (${m})`,
          model: m,
          createModel: () => nim(m),
        });
      }
    }
  }

  // 2. Secondary: OpenRouter GLM & Smartest Remaining Models via @openrouter/ai-sdk-provider
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

    // Secondary priority: GLM models on OpenRouter
    const glmModels = [
      "z-ai/glm-5.2",
      "z-ai/glm-5.2:free",
      "thudm/glm-4-9b-chat",
      "thudm/glm-4-9b-chat:free",
      "thudm/glm-z1-32b",
      "thudm/glm-z1-32b:free",
    ];

    for (const m of glmModels) {
      if (m !== userModel) {
        targets.push({ name: `OpenRouter GLM (${m})`, model: m, createModel: () => openrouter(m) });
      }
    }

    // 3. Fallback: Smartest remaining frontier models on OpenRouter
    const smartRemainingOpenRouterModels = [
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "deepseek/deepseek-r1",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct",
      "openai/gpt-4o-mini",
      "anthropic/claude-3-5-haiku",
    ];

    for (const m of smartRemainingOpenRouterModels) {
      if (m !== userModel) {
        targets.push({ name: `OpenRouter Smartest (${m})`, model: m, createModel: () => openrouter(m) });
      }
    }
  }

  // 4. Direct OpenAI Provider (Smartest Frontier fallback if OPENAI_API_KEY is available)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const openai = createOpenAI({
      apiKey: openaiKey,
      name: "openai",
    });
    targets.push(
      { name: "OpenAI (GPT-4o)", model: "gpt-4o", createModel: () => openai("gpt-4o") },
      { name: "OpenAI (GPT-4o-mini)", model: "gpt-4o-mini", createModel: () => openai("gpt-4o-mini") }
    );
  }

  // 5. Groq Provider (High-speed & reasoning models if GROQ_API_KEY is available)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groq = createOpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      name: "groq",
    });
    targets.push(
      { name: "Groq (DeepSeek-R1-Distill-70B)", model: "deepseek-r1-distill-llama-70b", createModel: () => groq("deepseek-r1-distill-llama-70b") },
      { name: "Groq (Llama-3.3-70B)", model: "llama-3.3-70b-versatile", createModel: () => groq("llama-3.3-70b-versatile") },
      { name: "Groq (Llama-3.1-8B)", model: "llama-3.1-8b-instant", createModel: () => groq("llama-3.1-8b-instant") }
    );
  }

  // 6. Cerebras Provider (Ultra-fast inference if CEREBRAS_API_KEY is available)
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) {
    const cerebras = createOpenAI({
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: cerebrasKey,
      name: "cerebras",
    });
    targets.push(
      { name: "Cerebras (Llama-3.3-70B)", model: "llama3.3-70b", createModel: () => cerebras("llama3.3-70b") },
      { name: "Cerebras (Llama-3.1-8B)", model: "llama3.1-8b", createModel: () => cerebras("llama3.1-8b") }
    );
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
