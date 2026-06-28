// SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-only

import type {
	ExtensionAPI,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

type RuntimeToolDefinition = Record<string, unknown>;

interface ToolDisplayAdapter {
	id?: string;
	toolName?: string;
	kind?: "read" | "edit" | "mcp" | "generic";
	overrideExistingRenderers?: boolean;
	renderCall?: (
		args: unknown,
		theme: RenderTheme,
		context?: ToolRenderContextLike,
	) => unknown;
	renderResult?: (
		result: unknown,
		options: ToolRenderResultOptions,
		theme: RenderTheme,
		context?: ToolRenderContextLike,
	) => unknown;
}

interface ToolDisplayApi {
	version: 1;
	decorateTool<T extends RuntimeToolDefinition>(
		tool: T,
		adapter?: ToolDisplayAdapter,
	): T;
}

interface RenderTheme {
	fg(role: string, text: string): string;
	bold(text: string): string;
}

interface ToolRenderContextLike {
	args?: unknown;
	isError?: boolean;
	toolCallId?: string;
}

const TOOL_DISPLAY_API_KEY = Symbol.for("pi-tool-display.api.v1");
const TOOL_DISPLAY_PENDING_DECORATIONS_KEY = Symbol.for(
	"pi-tool-display.pendingDecorations.v1",
);
const TOOL_INTERCEPTOR_KEY = Symbol.for(
	"pi-tool-display-codex.registerToolInterceptor.v1",
);
const DECORATED_KEY = Symbol.for("pi-tool-display-codex.decorated.v1");

const TARGET_TOOL_NAMES = new Set([
	"exec_command",
	"write_stdin",
	"apply_patch",
]);

interface RegisterToolInterception {
	original: ExtensionAPI["registerTool"];
	wrapped: ExtensionAPI["registerTool"];
}

type PiWithInterception = ExtensionAPI & {
	[TOOL_INTERCEPTOR_KEY]?: RegisterToolInterception;
};

function toRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function getTextField(value: unknown, field: string): string | undefined {
	const raw = toRecord(value)[field];
	return typeof raw === "string" ? raw : undefined;
}

function getNumberField(value: unknown, field: string): number | undefined {
	const raw = toRecord(value)[field];
	return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function clipText(value: string, max = 120): string {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function splitLines(value: string): string[] {
	if (!value) {
		return [];
	}
	return value.split(/\r?\n/);
}

function renderLinePreview(
	output: string,
	theme: RenderTheme,
	expanded: boolean,
	maxCollapsedLines = 8,
): string {
	const lines = splitLines(output);
	if (lines.length === 0 || lines.every((line) => line.length === 0)) {
		return theme.fg("muted", "↳ (no output)");
	}

	const limit = expanded ? 200 : maxCollapsedLines;
	const shown = lines.slice(0, limit);
	const hiddenCount = Math.max(0, lines.length - shown.length);

	let text = shown
		.map((line) => theme.fg("toolOutput", clipText(line, expanded ? 1000 : 180)))
		.join("\n");

	if (hiddenCount > 0) {
		text += `\n${theme.fg("muted", `... (${hiddenCount} more lines${expanded ? "" : ", expand to view"})`)}`;
	}

	return text;
}

function extractResultOutput(result: unknown): string {
	const resultRecord = toRecord(result);
	const details = toRecord(resultRecord.details);
	const detailsOutput = details.output;
	if (typeof detailsOutput === "string" && detailsOutput.length > 0) {
		return detailsOutput;
	}

	const content = Array.isArray(resultRecord.content)
		? resultRecord.content
		: [];
	for (const item of content) {
		const record = toRecord(item);
		if (record.type === "text" && typeof record.text === "string") {
			return record.text;
		}
	}

	return "";
}

type PatchAction = {
	action: "add" | "update" | "delete";
	path: string;
	added: number;
	removed: number;
};

function parsePatchActions(patchText: string): PatchAction[] {
	const actions: PatchAction[] = [];
	let current: PatchAction | undefined;

	const flush = (): void => {
		if (current) {
			actions.push(current);
		}
		current = undefined;
	};

	for (const line of splitLines(patchText)) {
		if (line.startsWith("*** Add File: ")) {
			flush();
			current = {
				action: "add",
				path: line.slice("*** Add File: ".length).trim(),
				added: 0,
				removed: 0,
			};
			continue;
		}

		if (line.startsWith("*** Update File: ")) {
			flush();
			current = {
				action: "update",
				path: line.slice("*** Update File: ".length).trim(),
				added: 0,
				removed: 0,
			};
			continue;
		}

		if (line.startsWith("*** Delete File: ")) {
			flush();
			current = {
				action: "delete",
				path: line.slice("*** Delete File: ".length).trim(),
				added: 0,
				removed: 0,
			};
			continue;
		}

		if (!current) {
			continue;
		}

		if (line.startsWith("+") && !line.startsWith("+++")) {
			current.added += 1;
			continue;
		}

		if (line.startsWith("-") && !line.startsWith("---")) {
			current.removed += 1;
		}
	}

	flush();
	return actions;
}

function summarizePatchCall(
	patchText: string,
	theme: RenderTheme,
	expanded: boolean,
): string {
	const actions = parsePatchActions(patchText);
	if (actions.length === 0) {
		return `${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("muted", "(patch)")}`;
	}

	const header = `${theme.fg("toolTitle", theme.bold("apply_patch"))} ${theme.fg("accent", `${actions.length} file${actions.length === 1 ? "" : "s"}`)}`;

	const maxItems = expanded ? 50 : 3;
	const shown = actions.slice(0, maxItems);
	const lines = shown.map((action) => {
		const label =
			action.action === "add"
				? "Added"
				: action.action === "delete"
					? "Deleted"
					: "Updated";
		const counts = action.action === "delete" ? "" : ` (+${action.added} -${action.removed})`;
		return `  ${theme.fg("muted", "•")} ${theme.fg("toolTitle", label)} ${theme.fg("accent", clipText(action.path, 140))}${theme.fg("muted", counts)}`;
	});

	if (!expanded && actions.length > shown.length) {
		lines.push(theme.fg("muted", `  ... (${actions.length - shown.length} more files, expand to view)`));
	}

	return [header, ...lines].join("\n");
}

function renderExecCall(args: unknown, theme: RenderTheme): Text {
	const cmd = getTextField(args, "cmd") ?? getTextField(args, "command") ?? "";
	const workdir = getTextField(args, "workdir");
	let text = `${theme.fg("toolTitle", theme.bold("exec_command"))} ${theme.fg("accent", clipText(cmd || "(empty command)", 180))}`;
	if (workdir) {
		text += `\n${theme.fg("muted", `↳ cwd: ${clipText(workdir, 120)}`)}`;
	}
	return new Text(text, 0, 0);
}

function renderExecResult(
	result: unknown,
	options: ToolRenderResultOptions,
	theme: RenderTheme,
): Text {
	if (options.isPartial) {
		return new Text(theme.fg("warning", "running..."), 0, 0);
	}

	let text = renderLinePreview(
		extractResultOutput(result),
		theme,
		options.expanded,
	);

	const details = toRecord(toRecord(result).details);
	const sessionId = getNumberField(details, "session_id");
	if (sessionId !== undefined) {
		text += `\n${theme.fg("accent", `Session ${sessionId} is still running`)}`;
	}
	const exitCode = getNumberField(details, "exit_code");
	if (exitCode !== undefined) {
		text += `\n${theme.fg("muted", `Exit code: ${exitCode}`)}`;
	}

	return new Text(text, 0, 0);
}

function renderWriteStdinCall(args: unknown, theme: RenderTheme): Text {
	const sessionId = getNumberField(args, "session_id");
	const chars = getTextField(args, "chars") ?? "";
	const action = chars.length === 0 ? "poll" : `send ${clipText(JSON.stringify(chars), 50)}`;
	const sessionText = sessionId !== undefined ? `session ${sessionId}` : "session";
	return new Text(
		`${theme.fg("toolTitle", theme.bold("write_stdin"))} ${theme.fg("accent", action)} ${theme.fg("muted", `(${sessionText})`)}`,
		0,
		0,
	);
}

function renderWriteStdinResult(
	result: unknown,
	options: ToolRenderResultOptions,
	theme: RenderTheme,
): Text {
	if (options.isPartial) {
		return new Text(theme.fg("warning", "waiting for terminal..."), 0, 0);
	}

	return new Text(
		renderLinePreview(
			extractResultOutput(result),
			theme,
			options.expanded,
		),
		0,
		0,
	);
}

function renderApplyPatchCall(
	args: unknown,
	theme: RenderTheme,
	context?: ToolRenderContextLike,
): Text {
	const patchText = getTextField(args, "input") ?? "";
	const expanded = Boolean(toRecord(context).expanded);
	return new Text(summarizePatchCall(patchText, theme, expanded), 0, 0);
}

function renderApplyPatchResult(
	result: unknown,
	options: ToolRenderResultOptions,
	theme: RenderTheme,
	context?: ToolRenderContextLike,
): Text {
	if (options.isPartial) {
		return new Text(theme.fg("warning", "applying patch..."), 0, 0);
	}

	const details = toRecord(toRecord(result).details);
	const status = getTextField(details, "status");
	const detailsResult = toRecord(details.result);
	const changedFiles = Array.isArray(detailsResult.changedFiles)
		? detailsResult.changedFiles.filter((item): item is string => typeof item === "string")
		: [];
	const createdFiles = Array.isArray(detailsResult.createdFiles)
		? detailsResult.createdFiles.filter((item): item is string => typeof item === "string")
		: [];
	const deletedFiles = Array.isArray(detailsResult.deletedFiles)
		? detailsResult.deletedFiles.filter((item): item is string => typeof item === "string")
		: [];
	const movedFiles = Array.isArray(detailsResult.movedFiles)
		? detailsResult.movedFiles.filter((item): item is string => typeof item === "string")
		: [];

	if (changedFiles.length === 0 && createdFiles.length === 0 && deletedFiles.length === 0 && movedFiles.length === 0) {
		const text = extractResultOutput(result);
		return new Text(
			text ? renderLinePreview(text, theme, options.expanded, 10) : theme.fg("muted", "Patch applied"),
			0,
			0,
		);
	}

	const stateLabel =
		status === "partial_failure"
			? theme.fg("warning", "partial failure")
			: status === "failed"
				? theme.fg("error", "failed")
				: theme.fg("success", "applied");

	const summary = `${theme.fg("toolTitle", theme.bold("Patch"))} ${stateLabel}: ${theme.fg("muted", `${changedFiles.length} changed, ${createdFiles.length} created, ${deletedFiles.length} deleted, ${movedFiles.length} moved`)}`;

	if (!options.expanded) {
		return new Text(summary, 0, 0);
	}

	const lines = [summary];
	const list = [
		...changedFiles,
		...createdFiles,
		...deletedFiles,
		...movedFiles,
	];
	for (const file of list.slice(0, 80)) {
		lines.push(`  ${theme.fg("muted", "•")} ${theme.fg("accent", clipText(file, 180))}`);
	}
	if (list.length > 80) {
		lines.push(theme.fg("muted", `  ... (${list.length - 80} more files)`));
	}

	const errorText = getTextField(details, "error");
	if (errorText && (status === "partial_failure" || status === "failed")) {
		lines.push(theme.fg(status === "failed" ? "error" : "warning", clipText(errorText, 500)));
	}

	return new Text(lines.join("\n"), 0, 0);
}

function getToolDisplayApi(): ToolDisplayApi | undefined {
	const api = (globalThis as Record<symbol, unknown>)[TOOL_DISPLAY_API_KEY];
	if (!api || typeof api !== "object") {
		return undefined;
	}
	const candidate = api as ToolDisplayApi;
	if (candidate.version !== 1 || typeof candidate.decorateTool !== "function") {
		return undefined;
	}
	return candidate;
}

function queueToolDisplayDecoration(
	tool: RuntimeToolDefinition,
	adapter: ToolDisplayAdapter,
): void {
	const globalQueue = (globalThis as Record<symbol, unknown>)[
		TOOL_DISPLAY_PENDING_DECORATIONS_KEY
	];
	const queue = Array.isArray(globalQueue)
		? globalQueue
		: [];
	queue.push({ tool, adapter });
	(globalThis as Record<symbol, unknown>)[TOOL_DISPLAY_PENDING_DECORATIONS_KEY] =
		queue;
}

function decorateToolForDisplay(
	tool: RuntimeToolDefinition,
	adapter: ToolDisplayAdapter,
): void {
	const api = getToolDisplayApi();
	if (!api) {
		queueToolDisplayDecoration(tool, adapter);
		return;
	}

	Object.assign(tool, api.decorateTool(tool, adapter));
}

function adapterForToolName(toolName: string): ToolDisplayAdapter | undefined {
	if (toolName === "exec_command") {
		return {
			id: "pi-tool-display-codex.exec_command",
			toolName,
			kind: "generic",
			overrideExistingRenderers: true,
			renderCall: (args, theme) => renderExecCall(args, theme),
			renderResult: (result, options, theme) =>
				renderExecResult(result, options, theme),
		};
	}

	if (toolName === "write_stdin") {
		return {
			id: "pi-tool-display-codex.write_stdin",
			toolName,
			kind: "generic",
			overrideExistingRenderers: true,
			renderCall: (args, theme) => renderWriteStdinCall(args, theme),
			renderResult: (result, options, theme) =>
				renderWriteStdinResult(result, options, theme),
		};
	}

	if (toolName === "apply_patch") {
		return {
			id: "pi-tool-display-codex.apply_patch",
			toolName,
			kind: "generic",
			overrideExistingRenderers: true,
			renderCall: (args, theme, context) =>
				renderApplyPatchCall(args, theme, context),
			renderResult: (result, options, theme, context) =>
				renderApplyPatchResult(result, options, theme, context),
		};
	}

	return undefined;
}

function markDecorated(tool: RuntimeToolDefinition): void {
	Object.defineProperty(tool, DECORATED_KEY, {
		value: true,
		enumerable: false,
		configurable: true,
		writable: false,
	});
}

function isDecorated(tool: RuntimeToolDefinition): boolean {
	return toRecord(tool)[DECORATED_KEY] === true;
}

function decorateMatchingTool(tool: unknown): void {
	if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
		return;
	}

	const runtimeTool = tool as RuntimeToolDefinition;
	if (isDecorated(runtimeTool)) {
		return;
	}

	const name = getTextField(runtimeTool, "name");
	if (!name || !TARGET_TOOL_NAMES.has(name)) {
		return;
	}

	const adapter = adapterForToolName(name);
	if (!adapter) {
		return;
	}

	decorateToolForDisplay(runtimeTool, adapter);
	markDecorated(runtimeTool);
}

function decorateExistingTools(pi: ExtensionAPI): void {
	let tools: unknown[] = [];
	try {
		tools = pi.getAllTools();
	} catch {
		return;
	}

	for (const tool of tools) {
		decorateMatchingTool(tool);
	}
}

function installRegisterToolInterceptor(pi: ExtensionAPI): void {
	const piWithInterception = pi as PiWithInterception;
	const existing = piWithInterception[TOOL_INTERCEPTOR_KEY];
	if (existing && pi.registerTool === existing.wrapped) {
		pi.registerTool = existing.original;
		delete piWithInterception[TOOL_INTERCEPTOR_KEY];
	}

	const originalRegisterTool = pi.registerTool;
	const wrappedRegisterTool: ExtensionAPI["registerTool"] = function (
		this: ExtensionAPI,
		tool,
	): void {
		decorateMatchingTool(tool);
		originalRegisterTool.call(this, tool);
	};

	pi.registerTool = wrappedRegisterTool;
	piWithInterception[TOOL_INTERCEPTOR_KEY] = {
		original: originalRegisterTool,
		wrapped: wrappedRegisterTool,
	};
}

export default function toolDisplayCodexBridge(pi: ExtensionAPI): void {
	installRegisterToolInterceptor(pi);
	decorateExistingTools(pi);

	pi.on("session_start", async () => {
		decorateExistingTools(pi);
	});

	pi.on("before_agent_start", async () => {
		decorateExistingTools(pi);
	});
}
