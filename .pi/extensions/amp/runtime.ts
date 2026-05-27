/**
 * Project runtime detection (Node, Python, Rust, etc) by file markers.
 * Returns a symbol + version string for footer display.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const VERSION_TIMEOUT_MS = 2000;

export type RuntimeInfo = {
	name: string;
	symbol: string;
	version?: string;
};

function has(cwd: string, files: string[]): boolean {
	return files.some((f) => existsSync(join(cwd, f)));
}

async function v(cmd: string, args: string[]): Promise<string | undefined> {
	try {
		const { stdout, stderr } = await execFileAsync(cmd, args, {
			timeout: VERSION_TIMEOUT_MS,
		});
		const text = `${stdout || ""}\n${stderr || ""}`.trim();
		// Extract first version-like token: v1.2.3 or 1.2.3
		const m = text.match(/v?\d+\.\d+(?:\.\d+)?/);
		return m ? m[0] : undefined;
	} catch {
		return undefined;
	}
}

const candidates: Array<{
	name: string;
	symbol: string;
	detect: (cwd: string) => boolean;
	version: () => Promise<string | undefined>;
}> = [
	{
		name: "bun",
		symbol: "",
		detect: (cwd) => has(cwd, ["bun.lock", "bun.lockb"]),
		version: () => v("bun", ["--version"]),
	},
	{
		name: "deno",
		symbol: "",
		detect: (cwd) => has(cwd, ["deno.json", "deno.jsonc", "deno.lock"]),
		version: () => v("deno", ["--version"]),
	},
	{
		name: "node",
		symbol: "",
		detect: (cwd) => has(cwd, ["package.json", ".nvmrc", ".node-version"]),
		version: () => v("node", ["--version"]),
	},
	{
		name: "python",
		symbol: "",
		detect: (cwd) =>
			has(cwd, ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"]),
		version: () => v("python3", ["--version"]),
	},
	{
		name: "go",
		symbol: "",
		detect: (cwd) => has(cwd, ["go.mod"]),
		version: () => v("go", ["version"]),
	},
	{
		name: "rust",
		symbol: "",
		detect: (cwd) => has(cwd, ["Cargo.toml"]),
		version: () => v("rustc", ["--version"]),
	},
	{
		name: "java",
		symbol: "",
		detect: (cwd) =>
			has(cwd, ["pom.xml", "build.gradle", "build.gradle.kts"]),
		version: () => v("java", ["-version"]),
	},
	{
		name: "kotlin",
		symbol: "",
		detect: (cwd) => has(cwd, ["build.gradle.kts"]),
		version: () => v("kotlin", ["-version"]),
	},
	{
		name: "ruby",
		symbol: "",
		detect: (cwd) => has(cwd, ["Gemfile", ".ruby-version"]),
		version: () => v("ruby", ["--version"]),
	},
	{
		name: "php",
		symbol: "",
		detect: (cwd) => has(cwd, ["composer.json"]),
		version: () => v("php", ["--version"]),
	},
];

export async function readRuntimeInfo(
	cwd: string,
): Promise<RuntimeInfo | undefined> {
	for (const c of candidates) {
		if (c.detect(cwd)) {
			const version = await c.version();
			return {
				name: c.name,
				symbol: c.symbol,
				version: version?.startsWith("v") ? version : version ? `v${version}` : undefined,
			};
		}
	}
	return undefined;
}
