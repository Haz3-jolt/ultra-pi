/**
 * zentui - Starship-inspired statusline for ultra-pi.
 *
 * Inspired by https://github.com/lmilojevicc/pi-zentui (MIT). Rewritten to
 * fix the "stale ctx" crash on session replacement: all dynamic data is
 * cached in module-level state and refreshed in event handlers; render()
 * never touches ctx directly.
 *
 * Activation: set ULTRA_PI_THEME=zentui (default theme). Any other value
 * (or unset) → no-op, pi's built-in UI stays.
 *
 * Footer shows:
 *   󰝰 cwd  on  branch [!?↑]  via  v22.0.0           75%/200k | ↑12k ↓4k | $0.042
 */

import type {
	AssistantMessage,
} from "@mariozechner/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
	type GitStatusSummary,
	emptyGitStatus,
	readGitStatus,
} from "./git.js";
import { type RuntimeInfo, readRuntimeInfo } from "./runtime.js";

// ── activation gate ───────────────────────────────────────────

const THEME_NAME = "zentui";
const ACTIVE = (process.env.ULTRA_PI_THEME ?? "zentui") === THEME_NAME;

// ── icons & colors (hardcoded; could be made config-driven later) ──

const ICONS = {
	cwd: "󰝰",
	git: "",
	ahead: "↑",
	behind: "↓",
	diverged: "⇕",
	conflicted: "=",
	untracked: "?",
	stashed: "$",
	modified: "!",
	staged: "+",
	renamed: "»",
	deleted: "✘",
	typechanged: "T",
};

const COLORS = {
	cwdText: "syntaxOperator",
	git: "syntaxKeyword",
	gitStatus: "error",
	contextNormal: "muted",
	contextWarning: "warning",
	contextError: "error",
	tokens: "muted",
	cost: "success",
	separator: "borderMuted",
};

// ── module-level state ────────────────────────────────────────

interface State extends GitStatusSummary {
	cwd: string;
	modelLabel: string;
	contextLabel: string;
	tokenLabel: string;
	costLabel: string;
	runtime?: RuntimeInfo;
}

const state: State = {
	cwd: process.cwd(),
	modelLabel: "no-model",
	contextLabel: "--",
	tokenLabel: "↑0 ↓0",
	costLabel: "$0.000",
	runtime: undefined,
	...emptyGitStatus(),
};

let requestRender: (() => void) | undefined;
let projectRefreshInFlight = false;
let projectRefreshPending = false;

// ── helpers ───────────────────────────────────────────────────

function fmtCount(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
	return `${Math.round(n / 1000)}k`;
}

type ThemeColor = Parameters<Theme["fg"]>[0];

function colorize(
	theme: Pick<Theme, "fg">,
	color: string,
	text: string,
): string {
	if (!text) return text;
	return theme.fg(color as ThemeColor, text);
}

function lastSegment(path: string): string {
	const norm = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = norm.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

function starshipPath(theme: Pick<Theme, "fg">, path: string): string {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
	let display = path;
	if (home && display.startsWith(home)) {
		display = "~" + display.slice(home.length);
	}
	const parts = display.split("/").filter(Boolean);
	if (parts.length === 0) return colorize(theme, COLORS.cwdText, "/");

	// Color scheme: tilde/root dim, middle segments muted, last segment bold accent
	const last = parts.pop()!;
	const prefix = display.startsWith("~") ? "~" : "/";
	const mid = parts.slice(display.startsWith("~") ? 1 : 0);

	const prefixStr = colorize(theme, "syntaxType", prefix);
	const sep = colorize(theme, "borderMuted", "/");
	const midStr = mid.map(p => colorize(theme, "muted", p)).join(sep);
	const lastStr = colorize(theme, COLORS.cwdText, last);

	const segments = [prefixStr, midStr, lastStr].filter(Boolean);
	return `${ICONS.cwd} ${segments.join(sep)}`;
}

function syncFromCtx(ctx: ExtensionContext): void {
	state.cwd = ctx.cwd;
	state.modelLabel = ctx.model?.id ?? "no-model";

	// context window usage
	const usage = ctx.getContextUsage();
	const cw = ctx.model?.contextWindow ?? usage?.contextWindow;
	if (!usage || !cw || cw <= 0) {
		state.contextLabel = "--";
	} else {
		const pct =
			usage.percent === null
				? "?"
				: `${Math.max(0, Math.min(999, Math.round(usage.percent)))}%`;
		state.contextLabel = `${pct}/${fmtCount(cw)}`;
	}

	// token + cost totals across the branch
	let input = 0;
	let output = 0;
	let cost = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const msg = entry.message as AssistantMessage;
		input += msg.usage?.input ?? 0;
		output += msg.usage?.output ?? 0;
		cost += msg.usage?.cost?.total ?? 0;
	}
	state.tokenLabel = `↑${fmtCount(input)} ↓${fmtCount(output)}`;
	state.costLabel = `$${cost.toFixed(3)}`;
}

async function refreshProject(cwd: string): Promise<void> {
	if (projectRefreshInFlight) {
		projectRefreshPending = true;
		return;
	}
	projectRefreshInFlight = true;
	try {
		const [git, runtime] = await Promise.all([
			readGitStatus(cwd),
			readRuntimeInfo(cwd),
		]);
		Object.assign(state, git);
		state.runtime = runtime;
	} finally {
		projectRefreshInFlight = false;
		requestRender?.();
		if (projectRefreshPending) {
			projectRefreshPending = false;
			void refreshProject(state.cwd);
		}
	}
}

function buildBranchLabel(theme: Pick<Theme, "fg">): string {
	if (!state.branch) return "";
	const gitColor = (t: string) => colorize(theme, COLORS.git, t);
	const gitStatusColor = (t: string) => colorize(theme, COLORS.gitStatus, t);

	const allStatus = [
		state.conflicted > 0 ? ICONS.conflicted : "",
		state.stashed ? ICONS.stashed : "",
		state.deleted > 0 ? ICONS.deleted : "",
		state.renamed > 0 ? ICONS.renamed : "",
		state.modified > 0 ? ICONS.modified : "",
		state.typechanged > 0 ? ICONS.typechanged : "",
		state.staged > 0 ? ICONS.staged : "",
		state.untracked > 0 ? ICONS.untracked : "",
	].join("");

	const aheadBehind =
		state.ahead > 0 && state.behind > 0
			? ICONS.diverged
			: state.ahead > 0
				? ICONS.ahead
				: state.behind > 0
					? ICONS.behind
					: "";

	const statusBlock =
		allStatus || aheadBehind
			? gitStatusColor(`[${allStatus}${aheadBehind}]`)
			: "";

	return `${colorize(theme, "text", "on")} ${gitColor(ICONS.git)} ${gitColor(state.branch)}${statusBlock ? ` ${statusBlock}` : ""}`;
}

function runtimeColor(name: string | undefined): string {
	switch (name) {
		case "node":
			return "success";
		case "deno":
		case "go":
			return "syntaxType";
		case "bun":
		case "python":
		case "java":
		case "kotlin":
			return "warning";
		case "rust":
		case "ruby":
			return "error";
		default:
			return "text";
	}
}

function buildRuntimeLabel(theme: Pick<Theme, "fg">): string {
	const r = state.runtime;
	if (!r) return "";
	const label = r.version ? `${r.symbol} ${r.version}` : r.symbol;
	return `${colorize(theme, "text", "via")} ${colorize(theme, runtimeColor(r.name), label)}`;
}

function pickContextColor(ctx: ExtensionContext | undefined): string {
	const usage = ctx?.getContextUsage();
	const p = usage?.percent;
	if (p === null || p === undefined) return COLORS.contextNormal;
	if (p >= 90) return COLORS.contextError;
	if (p >= 70) return COLORS.contextWarning;
	return COLORS.contextNormal;
}

// ── extension entry point ─────────────────────────────────────

export default function zentui(pi: ExtensionAPI) {
	if (!ACTIVE) return;

	const onSessionStart = (_e: unknown, ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;

		syncFromCtx(ctx);
		void refreshProject(ctx.cwd);

		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();

			const unsubscribeBranch = footerData.onBranchChange(() => {
				void refreshProject(state.cwd);
				tui.requestRender();
			});

			return {
				dispose: () => {
					unsubscribeBranch();
					requestRender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const innerWidth = Math.max(1, width - 2);
					const sep = colorize(theme, COLORS.separator, " | ");

					const cwdLabel = starshipPath(theme, state.cwd);
					const branchLabel = buildBranchLabel(theme);
					const runtimeLabel = buildRuntimeLabel(theme);

					const left = [cwdLabel, branchLabel, runtimeLabel]
						.filter(Boolean)
						.join(" ");

					const ctxColor = pickContextColor(ctx);
					const right = [
						colorize(theme, ctxColor, state.contextLabel),
						colorize(theme, COLORS.tokens, state.tokenLabel),
						colorize(theme, COLORS.cost, state.costLabel),
					].join(sep);

					const lw = visibleWidth(left);
					const rw = visibleWidth(right);
					const content =
						lw >= innerWidth
							? truncateToWidth(left, innerWidth)
							: lw + 1 + rw <= innerWidth
								? `${left}${" ".repeat(innerWidth - lw - rw)}${right}`
								: left;

					return [` ${content} `];
				},
			};
		});
	};

	pi.on("session_start", onSessionStart);

	const refreshOnEvent = (_e: unknown, ctx: ExtensionContext) => {
		syncFromCtx(ctx);
		requestRender?.();
	};

	pi.on("agent_start", refreshOnEvent);
	pi.on("agent_end", (_e, ctx) => {
		syncFromCtx(ctx);
		void refreshProject(ctx.cwd);
		requestRender?.();
	});
	pi.on("model_select", refreshOnEvent);
	pi.on("message_end", (_e, ctx) => {
		syncFromCtx(ctx);
		void refreshProject(ctx.cwd);
		requestRender?.();
	});
	pi.on("tool_execution_end", (_e, ctx) => {
		syncFromCtx(ctx);
		void refreshProject(ctx.cwd);
		requestRender?.();
	});
	pi.on("session_compact", (_e, ctx) => {
		syncFromCtx(ctx);
		requestRender?.();
	});
}
