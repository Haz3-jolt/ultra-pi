// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

const CSS = `body{max-width:860px;margin:2rem auto;padding:0 1rem;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#222}
pre{background:#f4f4f4;padding:1rem;overflow:auto;border-radius:6px}code{font-family:ui-monospace,monospace}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}blockquote{border-left:4px solid #ccc;margin:0;padding-left:1rem;color:#555}
@media(prefers-color-scheme:dark){body{background:#1d2021;color:#ebdbb2}pre{background:#282828}td,th{border-color:#504945}}`;

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((p: any) => (p?.type === "text" ? p.text : "")).join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("preview", {
		description: "Open a markdown file, or the last assistant message, rendered in the browser",
		handler: async (args, ctx) => {
			let md = "";
			const file = args.trim();
			if (file) {
				md = await readFile(resolve(ctx.cwd, file), "utf8");
			} else {
				const branch = ctx.sessionManager.getBranch() as any[];
				for (let i = branch.length - 1; i >= 0 && !md; i--) {
					const e = branch[i];
					if (e.type === "message" && e.message.role === "assistant") md = textOf(e.message.content).trim();
				}
			}
			if (!md) {
				ctx.ui.notify("preview: nothing to render", "warning");
				return;
			}
			// allowDangerousHtml stays off: raw HTML in markdown is escaped.
			const body = micromark(md, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
			const dir = await mkdtemp(join(tmpdir(), "pi-preview-"));
			const out = join(dir, "preview.html");
			await writeFile(out, `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${body}`);
			const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
			execFile(opener, [out], (err) => {
				if (err) ctx.ui.notify(`preview: failed to open ${out}: ${err.message}`, "error");
			});
			ctx.ui.notify(`preview: ${out}`, "info");
		},
	});
}
