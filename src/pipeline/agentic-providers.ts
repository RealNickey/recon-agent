/**
 * Multi-provider & multi-model fallback engine for AI SDK.
 * Supports cascading fallback across providers (Groq -> OpenRouter -> Cerebras -> OpenAI)
 * and across models to eliminate rate limits and latency bottlenecks.
 */
import { createOpenAI } from "@ai-sdk/openai";

export interface ProviderTarget {
  name: string;
  model: string;
  createModel: () => any;
}

export function hasApprovedProvider(): boolean {
  return Boolean(
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.CEREBRAS_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}

export function getAvailableProviderTargets(): ProviderTarget[] {
  const targets: ProviderTarget[] = [];

  // 1. Groq Provider (Ultra-fast 500+ tok/s if GROQ_API_KEY is available)
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

  // 2. OpenRouter Provider (Default / Free tier fallback chain)
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    const openrouter = createOpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey: openrouterKey,
      name: "openrouter",
    });

    const userModel = process.env.MODEL;
    if (userModel) {
      targets.push({ name: `OpenRouter (${userModel})`, model: userModel, createModel: () => openrouter(userModel) });
    }

    const freeModels = [
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "mistralai/mistral-small-24b-instruct-2501:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "z-ai/glm-5.2:free",
      "deepseek/deepseek-chat:free",
    ];

    for (const m of freeModels) {
      if (m !== userModel) {
        targets.push({ name: `OpenRouter (${m})`, model: m, createModel: () => openrouter(m) });
      }
    }
  }

  // 3. Cerebras Provider (if CEREBRAS_API_KEY is available)
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (cerebrasKey) {
    const cerebras = createOpenAI({
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: cerebrasKey,
      name: "cerebras",
    });
    targets.push({ name: "Cerebras (Llama-3.3-70B)", model: "llama3.3-70b", createModel: () => cerebras("llama3.3-70b") });
  }

  // 4. Direct OpenAI Provider (if OPENAI_API_KEY is available)
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
      // Log provider fallback attempt
      const msg = lastError.message;
      if (msg.includes("401") && targets.length === 1) {
        throw lastError; // only 1 provider and bad key
      }
      // If 429 rate limit or 5xx, proceed to next target in fallback cascade
    }
  }

  throw lastError ?? new Error("All AI providers in fallback chain exhausted");
}
