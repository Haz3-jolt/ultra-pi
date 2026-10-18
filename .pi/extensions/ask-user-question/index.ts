// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * ask_user_question: one or more questions, each with options, an optional
 * context header, and markdown. Code blocks render as boxes, mermaid diagrams
 * as ASCII. The last row accepts typed answers inline, no editor box.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, Text, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { renderMermaidAscii } from "beautiful-mermaid";
import { Type } from "typebox";

const OptionSchema = Type.Object({
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
});

const QuestionSchema = Type.Object({
	header: Type.Optional(Type.String({ description: "Optional short context line shown above the question, useful when asking many questions" })),
	question: Type.String({ description: "The question. Markdown is supported, including code blocks and ```mermaid blocks which are drawn as ASCII." }),
	options: Type.Array(OptionSchema, { description: "Options for the user to choose from" }),
	multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting several options. Space toggles, Enter submits all checked options." })),
});

const Params = Type.Object({
	questions: Type.Array(QuestionSchema, { description: "One or more questions, asked in order" }),
});

interface Answer {
	question: string;
	answer: string | null;
	wasCustom?: boolean;
	multi?: boolean;
}

type Segment = { kind: "md"; text: string } | { kind: "code"; lang: string; text: string } | { kind: "mermaid"; text: string };

// Split fenced blocks out of the markdown so they can be drawn as boxes.
function parseSegments(src: string): Segment[] {
	const out: Segment[] = [];
	const re = /```([^\n`]*)\n([\s\S]*?)```/g;
	let last = 0;
	for (const m of src.matchAll(re)) {
		if (m.index! > last) out.push({ kind: "md", text: src.slice(last, m.index) });
		const lang = m[1].trim();
		if (lang.toLowerCase() === "mermaid") out.push({ kind: "mermaid", text: m[2] });
		else out.push({ kind: "code", lang, text: m[2].replace(/\n$/, "") });
		last = m.index! + m[0].length;
	}
	if (last < src.length) out.push({ kind: "md", text: src.slice(last) });
	return out.filter((s) => s.kind !== "md" || s.text.trim().length > 0);
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user_question",
		label: "Ask User Question",
		description:
			"Ask the user one or more questions with selectable options. Use when requirements are ambiguous or a decision is needed before implementing. " +
			"Each question may have an optional header (context line), an optional multiSelect flag, and markdown, code blocks or mermaid diagrams in the question text. The user can always type a custom answer.",
		parameters: Params,
		executionMode: "sequential",

		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (ctx.mode !== "tui") {
				throw new Error("ask_user_question: UI not available (non-interactive mode)");
			}
			if (params.questions.length === 0 || params.questions.some((q) => q.options.length === 0)) {
				throw new Error("ask_user_question: every question needs at least one option");
			}

			const total = params.questions.length;
			const answers: Answer[] = [];

			for (let qi = 0; qi < total; qi++) {
				const q = params.questions[qi];
				const OTHER = "Type something else";
				const multi = q.multiSelect === true;
				const rows = [...q.options.map((o) => ({ ...o, other: false })), { label: OTHER, description: undefined as string | undefined, other: true }];

				const result = await ctx.ui.custom<{ answer: string; wasCustom: boolean } | null>((tui, theme, _kb, done) => {
					let idx = 0;
					let typed = "";
					const checked = new Set<number>();
					const mdTheme = getMarkdownTheme();
					const segments = parseSegments(q.question).map((s) => ({
						seg: s,
						md: s.kind === "md" ? new Markdown(s.text, 1, 0, mdTheme) : undefined,
					}));

					function handleInput(data: string) {
						const onOther = rows[idx].other;
						if (matchesKey(data, Key.up)) idx = Math.max(0, idx - 1);
						else if (matchesKey(data, Key.down)) idx = Math.min(rows.length - 1, idx + 1);
						else if (multi && !onOther && data === " ") {
							if (checked.has(idx)) checked.delete(idx);
							else checked.add(idx);
						} else if (matchesKey(data, Key.enter)) {
							const t = typed.trim();
							if (multi) {
								const picks = [...checked].sort((a, b) => a - b).map((i) => rows[i].label);
								if (t) picks.push(t);
								if (!picks.length) return;
								return done({ answer: picks.join(", "), wasCustom: picks.length === 1 && !!t });
							}
							if (!onOther) return done({ answer: rows[idx].label, wasCustom: false });
							if (t) return done({ answer: t, wasCustom: true });
							return;
						} else if (matchesKey(data, Key.escape)) {
							if (typed) typed = "";
							else return done(null);
						} else if (onOther && matchesKey(data, Key.backspace)) typed = typed.slice(0, -1);
						else if (onOther && !data.startsWith("\x1b")) {
							// Typed characters or pasted text (bracketed-paste markers stripped, newlines flattened).
							const clean = data.replace(/\x1b\[20[01]~/g, "").replace(/[\r\n]+/g, " ").replace(/[\x00-\x1f\x7f]/g, "");
							if (!clean) return;
							typed += clean;
						} else return;
						tui.requestRender();
					}

					function codeBox(lang: string, text: string, w: number): string[] {
						const border = (s: string) => theme.fg("borderMuted", s);
						const hl = (mdTheme as any).highlightCode?.(text, lang) as string[] | undefined;
						const lines = hl && hl.length ? hl : text.split("\n");
						const widest = Math.max(1, ...lines.map((l) => visibleWidth(l)));
						const label = lang ? ` ${lang} ` : "";
						const bw = Math.max(4, Math.min(w - 1, Math.max(widest + 4, visibleWidth(label) + 5)));
						const innerW = bw - 4;
						const out: string[] = [];
						const labelTrunc = truncateToWidth(label, Math.max(0, bw - 4), "");
						out.push(" " + border("╭─") + theme.fg("muted", labelTrunc) + border("─".repeat(Math.max(0, bw - 3 - visibleWidth(labelTrunc))) + "╮"));
						for (const l of lines) {
							const t = truncateToWidth(l, innerW, "…");
							out.push(" " + border("│ ") + t + " ".repeat(Math.max(0, innerW - visibleWidth(t))) + border(" │"));
						}
						out.push(" " + border("╰" + "─".repeat(bw - 2) + "╯"));
						return out;
					}

					function mermaidLines(src: string, w: number): string[] {
						try {
							const ascii = renderMermaidAscii(src.trim(), { colorMode: "none" }).trimEnd().split("\n");
							return ascii.map((l) => " " + truncateToWidth(l, Math.max(1, w - 1), "…"));
						} catch (e) {
							return [" " + theme.fg("warning", `[mermaid render failed: ${e instanceof Error ? e.message : String(e)}]`)];
						}
					}

					function render(width: number): string[] {
						const w = Math.max(10, width);
						const lines: string[] = [];
						lines.push(theme.fg("accent", "─".repeat(w)));
						if (q.header || total > 1) {
							const progress = total > 1 ? `[${qi + 1}/${total}] ` : "";
							lines.push(" " + theme.fg("accent", theme.bold(`${progress}${q.header ?? ""}`.trim())));
						}
						for (const { seg, md } of segments) {
							if (seg.kind === "md") lines.push(...md!.render(w));
							else if (seg.kind === "code") lines.push(...codeBox(seg.lang, seg.text, w));
							else lines.push(...mermaidLines(seg.text, w));
						}
						lines.push("");
						rows.forEach((o, i) => {
							const sel = i === idx;
							const pointer = sel ? theme.fg("accent", "> ") : "  ";
							const box = multi ? (o.other ? (typed.trim() ? "[x] " : "[ ] ") : checked.has(i) ? "[x] " : "[ ] ") : "";
							const num = `${i + 1}. ${box}`;
							if (o.other) {
								const cursor = sel ? theme.fg("accent", "█") : "";
								const body = typed ? theme.fg(sel ? "accent" : "text", typed) + cursor : sel ? cursor + theme.fg("dim", OTHER) : theme.fg("text", OTHER);
								lines.push(...wrapTextWithAnsi(pointer + theme.fg(sel ? "accent" : "text", num) + body, w));
							} else {
								lines.push(...wrapTextWithAnsi(pointer + theme.fg(sel ? "accent" : "text", num + o.label), w));
								if (o.description) {
									for (const d of wrapTextWithAnsi(theme.fg("muted", o.description), Math.max(1, w - 5))) lines.push("     " + d);
								}
							}
						});
						lines.push("");
						const hint = multi
							? rows[idx].other
								? "type your answer • Enter to submit checked • Esc to clear • ↑↓ navigate"
								: "Space to toggle • Enter to submit checked • Esc to cancel • ↑↓ navigate"
							: rows[idx].other
								? "type your answer • Enter to submit • Esc to clear • ↑↓ navigate"
								: "↑↓ navigate • Enter to select • Esc to cancel";
						lines.push(" " + theme.fg("dim", hint));
						lines.push(theme.fg("accent", "─".repeat(w)));
						return lines;
					}

					return {
						render,
						invalidate: () => {
							for (const s of segments) s.md?.invalidate();
						},
						handleInput,
					};
				});

				if (!result) {
					answers.push({ question: q.question, answer: null });
					break;
				}
				answers.push({ question: q.question, answer: result.answer, wasCustom: result.wasCustom, multi });
			}

			const lines = answers.map((a, i) =>
				a.answer === null
					? `Q${i + 1}: user cancelled`
					: `Q${i + 1} (${params.questions[i].header ?? params.questions[i].question.split("\n")[0]}): ${a.multi ? "User selected (multiple): " : a.wasCustom ? "User wrote: " : "User selected: "}${a.answer}`,
			);
			if (answers.length < total) lines.push(`${total - answers.length} remaining question(s) not asked because the user cancelled.`);
			return { content: [{ type: "text", text: lines.join("\n") }], details: { answers } };
		},

		renderCall(args, theme) {
			const qs = Array.isArray(args.questions) ? args.questions : [];
			const first = qs[0]?.header ?? qs[0]?.question?.split("\n")[0] ?? "";
			return new Text(theme.fg("toolTitle", theme.bold("ask_user_question ")) + theme.fg("muted", `${qs.length} question(s): ${first}`), 0, 0);
		},

		renderResult(result, _o, theme) {
			const answers = ((result.details as any)?.answers ?? []) as Answer[];
			if (!answers.length) return new Text("", 0, 0);
			const out = answers.map((a) =>
				a.answer === null
					? theme.fg("warning", "Cancelled")
					: theme.fg("success", "✓ ") + (a.wasCustom && !a.multi ? theme.fg("muted", "(wrote) ") : "") + theme.fg("accent", a.answer),
			);
			return new Text(out.join("\n"), 0, 0);
		},
	});
}
