# ultra-pi

Custom [pi.dev](https://pi.dev) coding harness.

## Stack

| Package                     | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `pi-subagents` (nicopreme)  | Subagent delegation, chains, parallel execution   |
| `pi-btw`                    | `/btw` side-channel for one-off questions         |
| `pi-mcp-adapter`            | Bridge any MCP server into pi                     |
| `pi-lens`                   | LSP + linters (biome/ruff/ast-grep) feedback loop |
| `pi-markdown-preview`       | Browser/PDF markdown + LaTeX preview              |
| `pi-mermaid`                | ASCII mermaid diagrams in TUI                     |
| `@plannotator/pi-extension` | Interactive plan review with annotations          |
| `dotenv-loader` (local)     | `.env` auto-load before extensions read config    |

## Layout

```
ultra-pi/
├── .pi/
│   ├── settings.json         # provider, model, packages
│   ├── SYSTEM.md             # global system prompt
│   ├── extensions/           # local TS extensions
│   │   └── dotenv-loader.ts
│   ├── prompts/              # slash commands
│   │   ├── note.md           # /note <topic>
│   │   └── decision.md       # /decision <topic>
│   ├── agents/               # subagent definitions (add as needed)
│   └── skills/               # local skills (add as needed)
├── docs/
│   ├── notes/                # persistent project memory (markdown)
│   └── decisions/            # ADRs
└── .env.example
```

## First-time setup

```bash
cd ~/code/ultra-pi

# 1. Install pi packages
npm install

# 2. Configure env
cp .env.example .env
$EDITOR .env     # set ANTHROPIC_API_KEY and JINA_API_KEY

# 3. Link this repo as a pi package and start
pi install . -l
pi
```

Inside pi:

```
/reload      # if already running
/note        # capture a non-obvious finding to docs/notes/
/decision    # write an ADR to docs/decisions/
/btw         # ask a side question without polluting context
```

## Persistent memory convention

This harness deliberately avoids the Obsidian/wiki-skill rabbit hole. Knowledge lives as plain markdown:

- `docs/notes/` - short notes on non-obvious facts and gotchas
- `docs/decisions/` - numbered ADRs

The agent is instructed (via `SYSTEM.md`) to grep these at task start and append to them when it discovers something worth remembering.

## Adding a subagent

Drop a markdown file in `.pi/agents/<name>.md`:

```
---
name: <name>
description: When the main agent should delegate to this one.
tools: read, grep, bash
---

You are a focused subagent that does X. Return a concise summary.
```

`/reload` to pick it up.

## Customising

- **Add an extension:** drop a `.ts` file in `.pi/extensions/`. See `dotenv-loader.ts` for the pattern. Docs: `pi`'s `extensions.md`.
- **Add a slash command:** drop `<name>.md` in `.pi/prompts/`. Use `$ARGUMENTS` for user input.
- **Add a third-party package:** add `"npm:<package>"` to `packages` in `.pi/settings.json`, run `npm install <package>`, `/reload`.
- **Change provider/model:** edit `defaultProvider`/`defaultModel` in `.pi/settings.json`.

## Notes on packages skipped

| Package                    | Why skipped                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pi-lean-ctx`              | Lossy compression of tool output; degrades context. Subagents + targeted tools solve the same problem with explicit boundaries.     |
| `caveman` skill            | Output-side compression saves <10% total tokens; degrades log readability. A "be concise" line in `SYSTEM.md` does 80% of the work. |
| Obsidian wiki (8 skills)   | Over-engineered. Plain `docs/notes/` + grep is 90% of the value at 5% of the surface area. Revisit if it proves needed.             |
| `rpiv-*` suite             | All v1.1.5, single author, untested. Wait for proven track record.                                                                  |
| `@yeliu84/pi-model-router` | Single-version package, single maintainer. Add only if you actually need per-turn model switching.                                  |
| `@posthog/pi`              | Telemetry - opt in only if you want analytics.                                                                                      |
