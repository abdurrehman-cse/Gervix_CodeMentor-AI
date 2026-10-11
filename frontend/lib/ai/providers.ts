export type Provider = { key: string; url: string; model: string; name: string; protocol?: "google" };
const googleUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const gemmaModels = ["gemma-4-26b-a4b-it", "gemma-4-31b-it"];
const groqModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
export function configuredProviders(env: NodeJS.ProcessEnv = process.env): Provider[] {
  if (env.AI_FREE_ONLY !== undefined && !["true", "false"].includes(env.AI_FREE_ONLY)) throw new Error("AI configuration invalid. AI_FREE_ONLY must be true or false.");
  const freeOnly = env.AI_FREE_ONLY === "true";
  const providers: Provider[] = [];
  if (freeOnly && env.GEMINI_API_KEY) {
    const model = env.GEMMA_MODEL || gemmaModels[0];
    if (!gemmaModels.includes(model)) throw new Error("AI configuration invalid. GEMMA_MODEL must be a supported free-only Gemma 4 model.");
    providers.push({ key: env.GEMINI_API_KEY, url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, model, name: "Gemma 4 (free)", protocol: "google" });
  }
  if (env.GROQ_API_KEY) {
    const model = env.GROQ_MODEL || groqModels[0];
    if (freeOnly && !groqModels.includes(model)) throw new Error("AI configuration invalid. GROQ_MODEL must be a supported free-plan model in free-only mode.");
    providers.push({ key: env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model, name: "Groq" });
  }
  if (freeOnly) return providers;
  if (env.AI_API_KEY) {
    if (!env.AI_API_URL || !env.AI_MODEL) throw new Error("AI configuration is incomplete. Set AI_API_URL and AI_MODEL on the server.");
    providers.unshift({ key: env.AI_API_KEY, url: env.AI_API_URL, model: env.AI_MODEL, name: "AI provider" });
  }
  if (env.OPENAI_API_KEY) providers.push({ key: env.OPENAI_API_KEY, url: "https://api.openai.com/v1/chat/completions", model: env.OPENAI_MODEL || "gpt-4.1-mini", name: "OpenAI" });
  if (env.GEMINI_API_KEY) providers.push({ key: env.GEMINI_API_KEY, url: googleUrl, model: env.GEMINI_MODEL || "gemini-flash-latest", name: "Gemini" });
  return providers;
}
