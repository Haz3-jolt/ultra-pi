/**
 * welcome-header - renders a "Welcome to ultra-pi" banner above the prompt
 * at the start of each pi session.
 *
 * Replaces pi's default keybinding-hints header. Run /builtin-header (from the
 * separate header extension, if installed) or remove this file to revert.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const TITLE = "Welcome to ultra-pi";
const SUBTITLE =
	"subagents · /btw · jina · pi-lens · plannotator · markdown · mermaid · mcp";

// ANSI helpers - bright cyan title, dim grey subtitle.
const ESC = "\x1b[";
const TITLE_STYLE = `${ESC}1;38;5;51m`; // bold bright cyan
const SUB_STYLE = `${ESC}38;5;244m`; // grey
const RESET = `${ESC}0m`;

function center(line: string, width: number, visibleLen: number): string {
	const pad = Math.max(0, Math.floor((width - visibleLen) / 2));
	return " ".repeat(pad) + line;
}

export default function welcomeHeader(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setHeader(() => ({
			render(width: number): string[] {
				const titleLine = `${TITLE_STYLE}${TITLE}${RESET}`;
				const subLine = `${SUB_STYLE}${SUBTITLE}${RESET}`;
				return [
					"",
					center(titleLine, width, TITLE.length),
					center(subLine, width, SUBTITLE.length),
					"",
				];
			},
			invalidate() {
				return false;
			},
		}));
	});

	pi.registerCommand("builtin-header", {
		description: "Restore pi's built-in header with keybinding hints",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
