// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WIDGET = "work-timer";
const USER_WAIT_TOOLS = new Set(["ask_user_question"]);

// Shows only units that have been reached: 5s, 2m 5s, 1h 2m 5s, 1d 1h 2m 5s.
function fmt(ms: number): string {
	const total = Math.floor(ms / 1000);
	const d = Math.floor(total / 86400);
	const h = Math.floor((total % 86400) / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const parts: string[] = [];
	if (d) parts.push(`${d}d`);
	if (d || h) parts.push(`${h}h`);
	if (d || h || m) parts.push(`${m}m`);
	parts.push(`${s}s`);
	return parts.join(" ");
}

export default function (pi: ExtensionAPI) {
	let start = 0;
	let pausedTotal = 0;
	let pausedSince = 0; // 0 = not paused
	let pauseDepth = 0;
	let interval: ReturnType<typeof setInterval> | undefined;

	const elapsed = () => (pausedSince ? pausedSince : Date.now()) - start - pausedTotal;

	const stop = () => {
		if (interval) clearInterval(interval);
		interval = undefined;
	};

	pi.on("agent_start", async (_e, ctx) => {
		start = Date.now();
		pausedTotal = 0;
		pausedSince = 0;
		pauseDepth = 0;
		if (!ctx.hasUI) return;
		const tick = () => {
			const label = `${pausedSince ? "Waiting for you" : "Working for"} ${fmt(elapsed())}`;
			ctx.ui.setWidget(WIDGET, [label], { placement: "aboveEditor" });
		};
		tick();
		if (interval) clearInterval(interval);
		interval = setInterval(tick, 1000);
	});

	pi.on("tool_execution_start", async (e) => {
		if (!USER_WAIT_TOOLS.has(e.toolName)) return;
		if (pauseDepth++ === 0) pausedSince = Date.now();
	});

	pi.on("tool_execution_end", async (e) => {
		if (!USER_WAIT_TOOLS.has(e.toolName)) return;
		if (--pauseDepth === 0 && pausedSince) {
			pausedTotal += Date.now() - pausedSince;
			pausedSince = 0;
		}
	});

	pi.on("agent_end", async (_e, ctx) => {
		if (!ctx.hasUI) return;
		if (pausedSince) {
			pausedTotal += Date.now() - pausedSince;
			pausedSince = 0;
		}
		const ms = elapsed();
		stop();
		// Pure UI: stays above the prompt until the next run starts; never stored in the session.
		// Stays above the prompt box until the next run starts. Never stored in the session.
		ctx.ui.setWidget(WIDGET, [`Took ${fmt(ms)}`], { placement: "aboveEditor" });
	});
}
