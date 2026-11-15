/** Maps Firebase AI Logic / network errors to a UI state and a plain message. Duck-typed so it stays pure. */
export type AssistantErrorKind = "unavailable" | "busy" | "blocked" | "network" | "cancelled" | "unknown";
export type AssistantError = { kind: AssistantErrorKind; message: string };

type MaybeAiError = { name?: string; code?: string; message?: string; customErrorData?: { status?: number } };

export function describeError(err: unknown): AssistantError {
  const e = (err && typeof err === "object" ? err : {}) as MaybeAiError;
  const status = e.customErrorData?.status;
  const text = String(e.message ?? "");
  if (e.name === "AbortError") return { kind: "cancelled", message: "Stopped." };
  if (/Firebase is not configured/i.test(text) || e.code?.endsWith("no-api-key") || e.code?.endsWith("no-project-id") || e.code?.endsWith("no-app-id"))
    return { kind: "unavailable", message: "Mission Control isn't configured for this deployment yet." };
  if (e.code?.endsWith("app-check/timeout"))
    return { kind: "unavailable", message: "Mission Control couldn't get an App Check token in time. In local development, set NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=true (or a registered UUID), restart the dev server, and register the debug token in the Firebase console." };
  if (e.code?.endsWith("api-not-enabled") || status === 403)
    return { kind: "unavailable", message: "Mission Control is unavailable: the AI service isn't enabled for this app, or App Check didn't verify this browser." };
  if (status === 404)
    return { kind: "unavailable", message: "Mission Control is unavailable: its prompt template wasn't found. If it was just created, wait a couple of minutes and retry." };
  if (status === 429)
    return { kind: "busy", message: "Mission Control is busy or over quota right now. Try again in a minute." };
  if (/blocked|safety|prohibited/i.test(text))
    return { kind: "blocked", message: "That request was blocked by the safety filters. Try rephrasing it." };
  if (e.code?.endsWith("fetch-error") || e.name === "TypeError" || status === 503)
    return { kind: "network", message: "Couldn't reach Mission Control. Check your connection and retry." };
  return { kind: "unknown", message: "Mission Control hit an error and couldn't answer. Please retry." };
}
