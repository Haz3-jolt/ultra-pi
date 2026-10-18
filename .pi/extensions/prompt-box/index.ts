// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * prompt-box: replaces the built-in footer and draws a closed box around the
 * prompt. Top: cwd and branch (left), model and effort (right). Bottom: usage
 * stats (left), tok/s (right). Pure UI, nothing enters the transcript.
 */

import {
	CustomEditor,
	type ExtensionAPI,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function fitBorder(left: string, right: string, width: number, border: (t: string) => string, lc: string, rc: string): string {
	if (width <= 1) return border("─".repeat(Math.max(0, width)));
	let l = left;
	let r = right;
	// Each end is two columns: corner plus one rule character.
	const over = () => 4 + visibleWidth(l) + visibleWidth(r) + 1 > width;
	while (over() && visibleWidth(l) > 0) l = truncateToWidth(l, visibleWidth(l) - 1, "");
	while (over() && visibleWidth(r) > 0) r = truncateToWidth(r, visibleWidth(r) - 1, "");
	const gap = Math.max(0, width - 4 - visibleWidth(l) - visibleWidth(r));
	return `${border(lc + "─")}${l}${border("─".repeat(gap))}${r}${border("─" + rc)}`;
}

const tokens = (n: number) => (n < 1000 ? `${n}` : n < 1e6 ? `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`);

class EmptyFooter implements Component {
	render(): string[] {
		return [];
	}
	invalidate(): void {}
}

export default function (pi: ExtensionAPI) {
	let tui: TUI | undefined;
	let tps: string | undefined;
	let branch: string | undefined;
	const unsubs = [
		pi.events.on("ultra:tps", (d) => {
			tps = typeof d === "string" ? d : undefined;
			tui?.requestRender();
		}),
	];

	pi.on("session_shutdown", () => {
		for (const u of unsubs) u();
		tui = undefined;
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setFooter(() => new EmptyFooter());

		void pi
			.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd })
			.then((r) => {
				branch = r.stdout.trim() || undefined;
				tui?.requestRender();
			})
			.catch((e) => ctx.ui.notify(`prompt-box: git branch lookup failed: ${e instanceof Error ? e.message : String(e)}`, "warning"));

		const stats = () => {
			let input = 0;
			let output = 0;
			let cacheRead = 0;
			let cacheWrite = 0;
			let cost = 0;
			let last: any;
			for (const e of ctx.sessionManager.getBranch() as any[]) {
				if (e.type !== "message" || e.message.role !== "assistant") continue;
				const u = e.message.usage;
				input += u.input;
				output += u.output;
				cacheRead += u.cacheRead;
				cacheWrite += u.cacheWrite;
				cost += u.cost?.total ?? 0;
				last = u;
			}
			// Cache hit of the most recent request: read / (read + uncached input + write).
			const denom = last ? last.cacheRead + last.input + last.cacheWrite : 0;
			const hit = denom > 0 ? `${((last.cacheRead / denom) * 100).toFixed(0)}%` : "n/a";
			const usage = ctx.getContextUsage();
			const pct = usage && usage.percent !== null ? `${usage.percent.toFixed(0)}%` : "?";
			return `↑${tokens(input)} ↓${tokens(output)} R${tokens(cacheRead)} W${tokens(cacheWrite)} CH${hit} $${cost.toFixed(2)} ${pct}`;
		};

		class PromptBoxEditor extends CustomEditor {
			constructor(t: TUI, theme: EditorTheme, kb: KeybindingsManager) {
				super(t, theme, kb, { paddingX: 0 });
				tui = t;
			}

			render(width: number): string[] {
				if (width < 6) return super.render(width);
				// Render the editor 2 columns narrower, then close the box with side borders.
				const inner = super.render(width - 2);
				if (inner.length < 2) return inner;
				const th = ctx.ui.theme;
				const border = (t: string) => this.borderColor(t);
				const plain = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, "");

				// Bottom border is the last line that starts with a horizontal rule;
				// anything after it (autocomplete menu) is passed through unwrapped.
				let bottom = inner.length - 1;
				while (bottom > 0 && !plain(inner[bottom]).startsWith("─")) bottom--;

				const home = process.env.HOME;
				const cwd = home && ctx.cwd.startsWith(home) ? `~${ctx.cwd.slice(home.length)}` : ctx.cwd;
				const topLeft = th.fg("muted", ` ${cwd}${branch ? ` (${branch})` : ""} `);
				const topRight = th.fg("muted", ` ${ctx.model ? ctx.model.id : "no model"} · ${pi.getThinkingLevel()} `);
				const bottomLeft = th.fg("muted", ` ${stats()} `);
				const bottomRight = tps ? th.fg("muted", ` ${tps} `) : "";

				const out: string[] = [];
				out.push(fitBorder(topLeft, topRight, width, border, "╭", "╮"));
				for (let i = 1; i < bottom; i++) out.push(`${border("│")}${inner[i]}${border("│")}`);
				out.push(fitBorder(bottomLeft, bottomRight, width, border, "╰", "╯"));
				for (let i = bottom + 1; i < inner.length; i++) out.push(inner[i]);
				return out;
			}
		}

		ctx.ui.setEditorComponent((t, theme, kb) => new PromptBoxEditor(t, theme, kb));
	});
}
