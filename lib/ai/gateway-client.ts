import { AI_CONFIG, type AiTaskType } from "./config";

export type AiGenerateOptions = {
  systemPrompt?: string;
  prompt: string;
  taskType: AiTaskType;
  modelTier?: "fast" | "reasoning" | "multimodal";
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
};

export type AiResponse<T = unknown> = {
  success: boolean;
  data: T | null;
  rawText?: string;
  error?: string;
  modelUsed: string;
  latencyMs: number;
};

export async function generateStructuredAi<T = unknown>(
  options: AiGenerateOptions
): Promise<AiResponse<T>> {
  const startTime = Date.now();
  const modelName = AI_CONFIG.models[options.modelTier || "fast"];

  if (!AI_CONFIG.geminiApiKey) {
    return {
      success: false,
      data: null,
      error: "AI_API_KEY_NOT_CONFIGURED",
      modelUsed: "none",
      latencyMs: Date.now() - startTime,
    };
  }

  // Determine endpoint: Cloudflare AI Gateway or Direct Google API
  const baseEndpoint = AI_CONFIG.gatewayUrl
    ? `${AI_CONFIG.gatewayUrl.replace(/\/$/, "")}/models/${modelName}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const url = `${baseEndpoint}?key=${AI_CONFIG.geminiApiKey}`;

  const contents: Array<{ role?: string; parts: Array<{ text: string }> }> = [];

  if (options.systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: `[SYSTEM INSTRUCTIONS / POLICY]\n${options.systemPrompt}\n[END SYSTEM INSTRUCTIONS]` }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood. I will strictly follow all instructions, output only valid JSON, and observe all accounting guardrails." }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: options.prompt }],
  });

  const requestBody = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? AI_CONFIG.defaultTemperature,
      maxOutputTokens: AI_CONFIG.maxTokens,
      responseMimeType: "application/json",
      ...(options.jsonSchema ? { responseSchema: options.jsonSchema } : {}),
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        success: false,
        data: null,
        error: `AI Provider Error: HTTP ${res.status} - ${errBody.slice(0, 200)}`,
        modelUsed: modelName,
        latencyMs: Date.now() - startTime,
      };
    }

    const json = await res.json();
    const textOutput = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textOutput) {
      return {
        success: false,
        data: null,
        error: "EMPTY_AI_RESPONSE",
        modelUsed: modelName,
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const parsedData = JSON.parse(textOutput) as T;
      return {
        success: true,
        data: parsedData,
        rawText: textOutput,
        modelUsed: modelName,
        latencyMs: Date.now() - startTime,
      };
    } catch {
      return {
        success: false,
        data: null,
        rawText: textOutput,
        error: "FAILED_TO_PARSE_JSON",
        modelUsed: modelName,
        latencyMs: Date.now() - startTime,
      };
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "NETWORK_OR_TIMEOUT_ERROR",
      modelUsed: modelName,
      latencyMs: Date.now() - startTime,
    };
  }
}
