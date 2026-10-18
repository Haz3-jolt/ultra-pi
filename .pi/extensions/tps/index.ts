// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const fmt = (n: number) => n.toFixed(1);

interface TurnStat {
	tokens: number;
	ms: number;
}

// Live message_end timing is unreliable (it can miss the wait for the first token),
// so figures come from the stored assistant messages: usage.output over durationMs.
// durationMs runs from request start, so tok/s includes time to first token.
function statsSince(branch: any[], since: number): TurnStat[] {
	const out: TurnStat[] = [];
	for (const e of branch) {
		const m = e?.type === "message" ? e.message : undefined;
		if (!m || m.role !== "assistant" || m.timestamp < since) continue;
		const tokens = m.usage?.output;
		if (typeof tokens !== "number" || typeof m.durationMs !== "number" || m.durationMs <= 0) {
			throw new Error(`tps: assistant message at ${m.timestamp} lacks usage.output or durationMs`);
		}
		out.push({ tokens, ms: m.durationMs });
	}
	return out;
}

export default function (pi: ExtensionAPI) {
	let agentStart = 0;

	pi.on("agent_start", async () => {
		agentStart = Date.now();
	});

	pi.on("turn_end", async (_e, ctx) => {
		if (!ctx.hasUI) return;
		try {
			const turns = statsSince(ctx.sessionManager.getBranch() as any[], agentStart);
			const t = turns[turns.length - 1];
			if (t) pi.events.emit("ultra:tps", `turn ${turns.length}: ${fmt(t.tokens / (t.ms / 1000))} tok/s`);
		} catch (e) {
			ctx.ui.notify(e instanceof Error ? e.message : String(e), "warning");
		}
	});

	pi.on("agent_end", async (_e, ctx) => {
		if (!ctx.hasUI) return;
		let turns: TurnStat[];
		try {
			turns = statsSince(ctx.sessionManager.getBranch() as any[], agentStart);
		} catch (e) {
			ctx.ui.notify(e instanceof Error ? e.message : String(e), "warning");
			return;
		}
		if (!turns.length) return;
		const tokens = turns.reduce((a, t) => a + t.tokens, 0);
		const secs = turns.reduce((a, t) => a + t.ms, 0) / 1000;
		const per = turns.map((t) => fmt(t.tokens / (t.ms / 1000))).join(", ");
		pi.events.emit("ultra:tps", `avg ${fmt(tokens / secs)} tok/s · ${turns.length} turn(s) · ${tokens} tok`);
	});
}
