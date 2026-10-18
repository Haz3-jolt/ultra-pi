// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { renderMermaidAscii } from "beautiful-mermaid";

const TYPE = "ultra-mermaid";
const BLOCK_RE = /```mermaid\s*([\s\S]*?)```/gi;
const MAX_BLOCKS = 5;

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((p: any) => (p?.type === "text" ? p.text : "")).join("\n");
}

function blocksIn(text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(BLOCK_RE)) {
		const code = m[1]?.trim();
		if (code) out.push(code);
		if (out.length >= MAX_BLOCKS) break;
	}
	return out;
}

export default function (pi: ExtensionAPI) {
	// Display-only: never sent to the model and never triggers a turn.
	pi.registerEntryRenderer<{ ascii: string }>(TYPE, (entry, _o, theme) => {
		const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
		box.addChild(new Text(theme.fg("customMessageLabel", theme.bold("Mermaid")) + "\n" + (entry.data?.ascii ?? ""), 0, 0));
		return box;
	});

	const render = (blocks: string[], notify: (m: string, t: "warning" | "error") => void) => {
		for (const [i, src] of blocks.entries()) {
			try {
				const ascii = renderMermaidAscii(src, { colorMode: "none" }).trimEnd();
				// display only; empty content is not meant for the model
				pi.appendEntry(TYPE, { ascii });
			} catch (e) {
				notify(`mermaid block ${i + 1} failed to render: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		}
	};

	pi.on("agent_end", async (event, ctx) => {
		for (let i = event.messages.length - 1; i >= 0; i--) {
			const msg: any = event.messages[i];
			if (msg.role !== "assistant") continue;
			const blocks = blocksIn(textOf(msg.content));
			if (blocks.length) render(blocks, (m, t) => ctx.hasUI && ctx.ui.notify(m, t));
			return;
		}
	});

	pi.registerCommand("mermaid", {
		description: "Render mermaid blocks from the last assistant message as ASCII",
		handler: async (_args, ctx) => {
			const branch = ctx.sessionManager.getBranch() as any[];
			for (let i = branch.length - 1; i >= 0; i--) {
				const e = branch[i];
				if (e.type !== "message" || e.message.role !== "assistant") continue;
				const blocks = blocksIn(textOf(e.message.content));
				if (!blocks.length) break;
				render(blocks, (m, t) => ctx.ui.notify(m, t));
				return;
			}
			ctx.ui.notify("No mermaid blocks found in the last assistant message", "warning");
		},
	});
}
