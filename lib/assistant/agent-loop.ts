/**
 * One user turn: stream the model, run the tools it asks for (bounded), feed results back, repeat.
 *
 * The SDK's automatic function calling is deliberately not used: a manual loop gives an exact round cap,
 * lets us validate and allowlist every call, and can be driven by a mock model in tests.
 */
import type { Part } from "firebase/ai";
import { MAX_CALLS_PER_ROUND, MAX_TOOL_ROUNDS, TOOL_LIMIT_WORDING, TOOL_PROGRESS, isToolName } from "./constants";
import { failure, type SourceRecord, type ToolOutcome } from "./tool-results";
import { executeToolCall, type ApplySurface, type ApplyUi, type ExecuteDeps } from "./tools";
import type { ToolContext } from "./tool-validation";

export type StreamChunk = { text(): string };
export type FinalResponse = { functionCalls(): { id?: string; name: string; args: object }[] | undefined };
export interface ChatLike {
  sendMessageStream(request: string | Array<string | Part>): Promise<{ stream: AsyncIterable<StreamChunk>; response: Promise<FinalResponse> }>;
}

export type TurnEvents = {
  /** Full text of the reply so far (it restarts if the model calls a tool after some preamble). */
  onText?: (text: string) => void;
  onToolStart?: (progressLabel: string) => void;
  onToolEnd?: (record: SourceRecord) => void;
  /** Diagnostics: the model asked for a tool, with its raw arguments. */
  onToolCall?: (name: string, args: unknown) => void;
  /** Diagnostics: a model request starts (round 0 is the user's message). */
  onRequest?: (round: number) => void;
  /** Diagnostics: a model response finished streaming. */
  onResponse?: (info: { round: number; chars: number; functionCalls: string[] }) => void;
};

export type TurnResult = { text: string; records: SourceRecord[]; toolLimitHit: boolean; rounds: number };

export type TurnParams = {
  chat: ChatLike;
  userText: string;
  ctx: ToolContext;
  events?: TurnEvents;
  signal?: AbortSignal;
  maxRounds?: number;
  /** Injectable for tests. */
  /** Changes the Open Exploration view for show_in_freeplay. */
  applyUi?: ApplyUi;
  /** Edits the surface drive's placed hardware for edit_surface_setup. */
  applySurface?: ApplySurface;
  /** Browser-computed estimates (launch plan, solar power); omitted in pure tests. */
  planLaunch?: ExecuteDeps["planLaunch"];
  estimatePower?: ExecuteDeps["estimatePower"];
  execute?: (call: { name: unknown; args: unknown }, id: string, ctx: ToolContext, deps: { signal?: AbortSignal; applyUi?: ApplyUi; applySurface?: ApplySurface; planLaunch?: ExecuteDeps["planLaunch"]; estimatePower?: ExecuteDeps["estimatePower"] }) => Promise<ToolOutcome>;
};

export async function runTurn(p: TurnParams): Promise<TurnResult> {
  const { chat, userText, ctx, events, signal, maxRounds = MAX_TOOL_ROUNDS, execute = executeToolCall, applyUi, applySurface, planLaunch, estimatePower } = p;
  const records: SourceRecord[] = [];
  let request: string | Array<string | Part> = userText;
  let rounds = 0;
  let callCounter = 0;

  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    events?.onRequest?.(rounds);
    const result = await chat.sendMessageStream(request);
    let text = "";
    for await (const chunk of result.stream) {
      text += chunk.text();
      events?.onText?.(text);
    }
    const final = await result.response;
    const calls = final.functionCalls() ?? [];
    events?.onResponse?.({ round: rounds, chars: text.length, functionCalls: calls.map((c) => c.name) });
    if (calls.length === 0) return { text, records, toolLimitHit: false, rounds };

    if (rounds >= maxRounds) return { text: text.trim() ? text : TOOL_LIMIT_WORDING, records, toolLimitHit: true, rounds };
    rounds++;
    events?.onText?.("");

    const parts = await Promise.all(calls.map(async (call, index): Promise<Part> => {
      const id = `call-${++callCounter}`;
      events?.onToolCall?.(call.name, call.args);
      if (isToolName(call.name)) events?.onToolStart?.(TOOL_PROGRESS[call.name]);
      const outcome = index >= MAX_CALLS_PER_ROUND
        ? failure(isToolName(call.name) ? call.name : "unknown", id, { code: "invalid_arguments", message: `Too many tool calls in one round (limit ${MAX_CALLS_PER_ROUND}).` })
        : await execute({ name: call.name, args: call.args }, id, ctx, { signal, applyUi, applySurface, planLaunch, estimatePower });
      records.push(outcome.record);
      events?.onToolEnd?.(outcome.record);
      return { type: "functionResponse", functionResponse: { name: call.name, response: outcome.response, ...(call.id ? { id: call.id } : {}) } };
    }));
    request = parts;
  }
}
