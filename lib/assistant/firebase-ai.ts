/**
 * Firebase AI Logic (Gemini Developer API) client for Mission Control, using a server prompt template.
 *
 * No Gemini key exists in the client: the browser talks to Firebase AI Logic, which holds the key and
 * the template. App Check protects that endpoint. The persona and rules live in the template, never here.
 */
import "client-only";

import { getAI, getTemplateGenerativeModel, GoogleAIBackend, type AI, type Content } from "firebase/ai";
import { getToken as getAppCheckToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import { getFirebaseApp } from "@/lib/firebase/client";
import { parseDebugTokenSetting } from "./app-check-env";
import { DEFAULT_TEMPLATE_ID } from "./constants";
import type { ChatLike } from "./agent-loop";
import type { ChatMessage } from "./guards";
import { toolDeclarations } from "./tool-schemas";

declare global {
  // Documented App Check debug switch: `true` prints a token to register in the console, or a registered UUID.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

const TEMPLATE_ID = process.env.NEXT_PUBLIC_MISSION_CONTROL_TEMPLATE_ID || DEFAULT_TEMPLATE_ID;
const REQUEST_TIMEOUT_MS = 60_000;

let ai: AI | null = null;
let appCheckStarted = false;
let appCheck: AppCheck | null = null;
const APP_CHECK_TIMEOUT_MS = 10_000;

function startAppCheck(app: FirebaseApp) {
  if (appCheckStarted) return;
  appCheckStarted = true;
  const siteKey = process.env.NEXT_PUBLIC_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const dev = process.env.NODE_ENV !== "production";
  // The debug provider is for local development only and is ignored in production builds.
  const setting = dev ? parseDebugTokenSetting(process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) : { mode: "off" as const };
  if (setting.mode === "generate") globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  else if (setting.mode === "token") globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = setting.token;
  const useDebug = setting.mode === "generate" || setting.mode === "token";
  if (dev && setting.mode === "invalid") {
    console.warn(`Mission Control: NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN is set (${setting.length} characters) but is neither "true" nor a debug-token UUID, so it was ignored. Use "true" to generate one, or paste a UUID registered in the console. Restart \`npm run dev\` after editing .env.local.`);
  }
  if (dev && !siteKey && !useDebug) {
    console.warn("Mission Control: App Check is not set up, so requests go out without a token and fail once App Check is enforced. Set NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=true in .env.local and restart `npm run dev` (Next reads env vars at startup).");
  }
  if (dev && setting.mode === "generate") {
    console.info("Mission Control: App Check debug mode is on. A 'Firebase App Check debug token' is printed once below and then stored in this browser. If none appears you already have one: run indexedDB.deleteDatabase('firebase-app-check-database') in this console, then reload.");
  }
  if (!siteKey && !useDebug) return;
  try {
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey ?? "debug-provider"), isTokenAutoRefreshEnabled: true });
  } catch {
    // Already initialised (fast refresh): reuse it.
  }
}

let fetchLogged = false;
/** Development only: logs status and time-to-headers for Firebase AI and App Check requests (no bodies, no headers). */
function logAiFetchesInDev() {
  if (fetchLogged || process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  fetchLogged = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/firebasevertexai\.googleapis\.com|firebaseappcheck\.googleapis\.com/.test(url)) return original(input, init);
    const label = new URL(url).pathname.split("/").slice(-1)[0];
    const started = performance.now();
    console.info(`[mission-control] -> ${label}`);
    try {
      const response = await original(input, init);
      console.info(`[mission-control] <- ${label} HTTP ${response.status} headers after ${Math.round(performance.now() - started)}ms`);
      return response;
    } catch (e) {
      console.warn(`[mission-control] x ${label} failed after ${Math.round(performance.now() - started)}ms:`, (e as Error)?.name, (e as Error)?.message);
      throw e;
    }
  };
}

function aiInstance(): AI {
  if (ai) return ai;
  logAiFetchesInDev();
  const app = getFirebaseApp();
  startAppCheck(app);
  ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: process.env.NEXT_PUBLIC_APPCHECK_LIMITED_USE_TOKENS === "true" });
  return ai;
}

/** Starts Firebase AI Logic and App Check early (when the panel opens) so setup problems and the debug token show up before the first question. */
export function warmUp(): void {
  try { aiInstance(); } catch { /* surfaced when a question is sent */ }
}

/**
 * Fetches an App Check token up front with a time limit. The AI SDK waits on this token before sending any
 * request and that wait is not covered by its own request timeout, so a stalled token exchange would
 * otherwise look like the model "thinking" forever. Token errors are not fatal here (the backend decides
 * whether to enforce); only a stall is.
 */
export async function checkAppCheck(): Promise<void> {
  aiInstance();
  if (!appCheck) return;
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    getAppCheckToken(appCheck, false).then(() => "ok" as const, (e: unknown) => e),
    new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), APP_CHECK_TIMEOUT_MS); }),
  ]);
  clearTimeout(timer);
  const ms = Math.round(performance.now() - started);
  if (outcome === "timeout") {
    if (process.env.NODE_ENV !== "production") console.error(`[mission-control] App Check returned no token after ${ms}ms.`);
    throw Object.assign(new Error("App Check token request timed out"), { code: "app-check/timeout" });
  }
  if (process.env.NODE_ENV !== "production") {
    if (outcome === "ok") console.info(`[mission-control] App Check token ok (${ms}ms)`);
    else console.warn(`[mission-control] App Check could not get a token (${ms}ms):`, (outcome as Error)?.message ?? outcome);
  }
}

const toContent = (m: ChatMessage): Content => ({ role: m.role, parts: [{ type: "text", text: m.text }] });

/** A fresh template chat for one turn. History is text-only; tools are re-called each turn so facts are never stale. */
export function createTurnChat(history: ChatMessage[], templateVariables: Record<string, unknown>, signal?: AbortSignal): ChatLike {
  const model = getTemplateGenerativeModel(aiInstance(), { timeout: REQUEST_TIMEOUT_MS });
  const session = model.startChat({
    templateId: TEMPLATE_ID,
    templateVariables,
    history: history.map(toContent),
    // Names + parameter schemas only. Descriptions and the rules for using the tools live in the template.
    tools: [{ functionDeclarations: toolDeclarations() }],
  });
  return {
    async sendMessageStream(request) {
      const result = await session.sendMessageStream(request, signal ? { signal } : undefined);
      return {
        stream: (async function* () {
          for await (const chunk of result.stream) {
            // Read text parts directly: chunk.text() warns on chunks that carry function calls.
            const parts = chunk.candidates?.[0]?.content?.parts ?? [];
            const text = parts.map((p) => ("text" in p && typeof p.text === "string" && !p.thought ? p.text : "")).join("");
            yield { text: () => text };
          }
        })(),
        response: result.response,
      };
    },
  };
}
