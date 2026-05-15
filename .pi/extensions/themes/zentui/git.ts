/**
 * Git status reader. Used by themes that show repo state in the footer.
 * Pure helper, no pi imports — safe to import from any theme.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitStatusSummary = {
	branch?: string;
	dirty: boolean;
	ahead: number;
	behind: number;
	conflicted: number;
	untracked: number;
	stashed: boolean;
	modified: number;
	staged: number;
	renamed: number;
	deleted: number;
	typechanged: number;
};

export function emptyGitStatus(): GitStatusSummary {
	return {
		branch: undefined,
		dirty: false,
		ahead: 0,
		behind: 0,
		conflicted: 0,
		untracked: 0,
		stashed: false,
		modified: 0,
		staged: 0,
		renamed: 0,
		deleted: 0,
		typechanged: 0,
	};
}

function parsePorcelain(text: string, hasStash: boolean): GitStatusSummary {
	const s = emptyGitStatus();
	s.stashed = hasStash;

	for (const line of text.split(/\r?\n/)) {
		if (!line) continue;
		if (line.startsWith("# branch.head ")) {
			const b = line.slice("# branch.head ".length).trim();
			s.branch = b && b !== "(detached)" ? b : undefined;
			continue;
		}
		if (line.startsWith("# branch.ab ")) {
			const m = line.match(/\+(\d+)\s+-(\d+)/);
			if (m) {
				s.ahead = Number(m[1] ?? 0);
				s.behind = Number(m[2] ?? 0);
			}
			continue;
		}
		if (line.startsWith("#")) continue;

		s.dirty = true;
		if (line.startsWith("? ")) {
			s.untracked += 1;
			continue;
		}
		if (line.startsWith("u ")) {
			s.conflicted += 1;
			continue;
		}
		if (!(line.startsWith("1 ") || line.startsWith("2 "))) continue;

		const xy = line.split(" ")[1] ?? "..";
		const x = xy[0] ?? ".";
		const y = xy[1] ?? ".";

		if (x === "R") s.renamed += 1;
		else if (x === "D") s.deleted += 1;
		else if (x === "T") s.typechanged += 1;
		else if (x !== "." && x !== " ") s.staged += 1;

		if (y === "M") s.modified += 1;
		else if (y === "D") s.deleted += 1;
		else if (y === "T") s.typechanged += 1;
	}

	return s;
}

export async function readGitStatus(cwd: string): Promise<GitStatusSummary> {
	try {
		const [statusRes, stashRes] = await Promise.all([
			execFileAsync("git", ["status", "--porcelain=2", "--branch"], { cwd }),
			execFileAsync("git", ["rev-parse", "--verify", "--quiet", "refs/stash"], {
				cwd,
			}).catch(() => ({ stdout: "" })),
		]);
		const out = String(statusRes.stdout ?? "");
		const stash = String(stashRes.stdout ?? "").trim().length > 0;
		return parsePorcelain(out, stash);
	} catch {
		return emptyGitStatus();
	}
}
