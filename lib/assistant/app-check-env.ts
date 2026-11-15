/** Interprets NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN. Pure so it can be tested; never logs the value. */
export type DebugTokenSetting =
  | { mode: "off" }
  | { mode: "generate" }
  | { mode: "token"; token: string }
  | { mode: "invalid"; length: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDebugTokenSetting(raw: string | undefined): DebugTokenSetting {
  const v = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (v === "" || /^(false|0|off|no)$/i.test(v)) return { mode: "off" };
  if (/^true$/i.test(v)) return { mode: "generate" };
  if (UUID.test(v)) return { mode: "token", token: v };
  return { mode: "invalid", length: v.length };
}
