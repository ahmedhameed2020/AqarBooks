import { AI_CONFIG } from "./config";

/**
 * Whether the AI assistants can honestly be offered in the UI.
 *
 * With no provider credential configured every AI route answers AI_API_KEY_NOT_CONFIGURED, so showing
 * the assistants (the floating "Ask AqarBooks" button, the dashboard insight card, the journal copilot)
 * only advertises something that cannot work. AI_UI_DISABLED=true is an explicit off switch for an
 * environment that has a key but must not show AI (for example a public demo).
 */
export function isAiAvailable(): boolean {
  return Boolean(AI_CONFIG.geminiApiKey) && process.env.AI_UI_DISABLED !== "true";
}
