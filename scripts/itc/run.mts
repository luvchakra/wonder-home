// Integration test-case harness (temporary): runs each conversation through the golden runner's real pipeline.
import { readFileSync } from "node:fs";
import { resolveDeterministicIntent } from "../../packages/core/src/conversation/engine.ts";
import { modelsFor } from "../../packages/core/src/evaluation/run.ts";
import { observeConversation } from "../../packages/core/src/evaluation/runners.ts";
import { readCorrection } from "../../packages/core/src/conversation/corrections.ts";
import { splitRequest } from "../../packages/core/src/conversation/decompose.ts";
const spec = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as { id: string; h: string; a: string; t: string[]; autonomy?: string; confirm?: boolean; voice?: boolean }[];
const only = process.argv[3];
// ITC_PROVIDER=google runs each turn through the model path as production does (the owner's QA Gemini key).
const key = process.env.ITC_PROVIDER === "google" ? readFileSync("apps/web/.env.local", "utf8").match(/^QA_GEMINI_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "") : undefined;
const configured = key ? modelsFor({ provider: "google", key }).models : {};
// As the route does (hometalk-turn.ts): a plain question the rules read is never sent to the model.
const models = configured.understand
  ? { ...configured, understand: (utterance: string, ctx: any) => { const quick = resolveDeterministicIntent(utterance, { actorMemberId: ctx.actorMemberId, channel: ctx.channel }); const plain = ["ask_status", "greet", "find_places", "open_screen", "check_agents"].includes(quick.action) && quick.confidence >= 0.8; return plain ? quick : configured.understand!(utterance, ctx); } }
  : configured;
for (const s of spec) {
  if (only && !s.id.startsWith(only)) continue;
  // The route splits a turn into its requests (decompose.ts) and runs each through the engine in turn.
  s.t = s.t.flatMap((u) => (readCorrection(u) ? [u] : splitRequest(u)));
  const c: any = { id: s.id, surface: "hometalk", household: s.h, category: "cross_domain", actor: s.a, description: "", utterance: s.t[0], expected: {}, followUps: s.t.slice(1).map((u) => ({ utterance: u, expected: {} })), ...(s.autonomy ? { autonomy: s.autonomy } : {}), ...(s.confirm ? { confirmRequestedChanges: true } : {}), ...(s.voice ? { channel: "voice" } : {}) };
  try {
    const obs = await observeConversation(c, models);
    console.log(`\n### ${s.id} (${s.h}/${s.a})`);
    obs.forEach((o, i) => console.log(`  U: ${s.t[i]}\n  W: [${o.interpretation}|${o.action}|date=${o.date}|ent=${o.entity}] ${o.answer.replace(/\n/g, " ⏎ ").slice(0, 700)}`));
  } catch (e) { console.log(`\n### ${s.id} ERROR ${(e as Error).message}`); }
}
