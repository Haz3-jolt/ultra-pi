// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { uuidv7 } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, matchesKey, Text } from "@earendil-works/pi-tui";

type Block = { type?: string; text?: string };

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Block[])
		.filter((b) => b?.type === "text" && typeof b.text === "string")
		.map((b) => b.text)
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	// Side thread state: lives only in memory, never enters main session context.
	let thread: { role: "user" | "assistant"; text: string }[] = [];

	pi.registerCommand("btw", {
		description: "Ask a read-only side question with main-session context (no tools, not added to main context). /btw:new resets.",
		handler: async (args, ctx) => {
			const question = args.trim();
			if (!question) {
				ctx.ui.notify("Usage: /btw <question>", "warning");
				return;
			}
			if (!ctx.model) {
				ctx.ui.notify("btw failed: no active model", "error");
				return;
			}
			if (!ctx.modelRegistry.hasConfiguredAuth(ctx.model)) {
				ctx.ui.notify(`btw failed: no auth configured for ${ctx.model.provider}/${ctx.model.id}`, "error");
				return;
			}

			const convo: string[] = [];
			for (const entry of ctx.sessionManager.getBranch() as any[]) {
				if (entry.type !== "message" || !entry.message) continue;
				const role = entry.message.role;
				if (role !== "user" && role !== "assistant") continue;
				const t = textOf(entry.message.content).trim();
				if (t) convo.push(`${role === "user" ? "User" : "Assistant"}: ${t}`);
			}

			const now = Date.now();
			const messages = [
				{
					role: "user" as const,
					content: [
						{
							type: "text" as const,
							text:
								"You are answering a quick side question (btw) while the main agent works. " +
								"You have no tools. Answer concisely from the main conversation below.\n\n" +
								`<main_conversation>\n${convo.join("\n\n")}\n</main_conversation>`,
						},
					],
					timestamp: now,
				},
				{ role: "assistant" as const, content: [{ type: "text" as const, text: "Understood." }], timestamp: now } as any,
				...thread.map((m) => ({
					role: m.role,
					content: [{ type: "text" as const, text: m.text }],
					timestamp: now,
				})),
				{ role: "user" as const, content: [{ type: "text" as const, text: question }], timestamp: now },
			];

			ctx.ui.notify("btw: thinking...", "info");
			const response = await ctx.modelRegistry.complete(
				ctx.model,
				{ messages } as any,
				{ cacheRetention: "none", sessionId: uuidv7() },
			);
			const answer = textOf(response.content).trim() || "(empty response)";
			thread.push({ role: "user", text: question }, { role: "assistant", text: answer });

			await ctx.ui.custom((_tui, theme, _kb, done) => {
				const container = new Container();
				const border = new DynamicBorder((s: string) => theme.fg("accent", s));
				container.addChild(border);
				container.addChild(new Text(theme.fg("accent", theme.bold("btw: ")) + theme.fg("muted", question), 1, 0));
				container.addChild(new Markdown(answer, 1, 1, getMarkdownTheme()));
				container.addChild(new Text(theme.fg("dim", "Enter or Esc to close"), 1, 0));
				container.addChild(border);
				return {
					render: (w: number) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (d: string) => {
						if (matchesKey(d, "enter") || matchesKey(d, "escape")) done(undefined);
					},
				};
			});
		},
	});

	pi.registerCommand("btw:new", {
		description: "Clear the btw side thread",
		handler: async (_args, ctx) => {
			thread = [];
			ctx.ui.notify("btw thread cleared", "info");
		},
	});
}
