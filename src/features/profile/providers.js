/*
  The AI providers a student can add their own API key for (Account settings), with their
  display names. Provider and model names are not translated.
*/
export const PROVIDERS = [
  { id: "anthropic", name: "Anthropic Claude", placeholder: "sk-ant-…", consoleUrl: "https://console.anthropic.com/settings/keys" },
  { id: "gemini", name: "Google Gemini", placeholder: "AIza…", consoleUrl: "https://aistudio.google.com/apikey" },
  { id: "openai", name: "OpenAI GPT", placeholder: "sk-…", consoleUrl: "https://platform.openai.com/api-keys" },
];

export function providerName(id) {
  if (id === "lectra") return "LECTRA";
  return PROVIDERS.find((item) => item.id === id)?.name ?? id;
}
