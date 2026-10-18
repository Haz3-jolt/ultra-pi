<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan <harisrini21@gmail.com> -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# ultra-pi

My pi harness bundle.

## Install

```bash
git clone https://github.com/Haz3-jolt/ultra-pi.git
cd ultra-pi
npm run install:extensions
pi install .
pi install npm:@juicesharp/rpiv-web-tools
cp .pi/AGENTS.md ~/.pi/agent/AGENTS.md
```

## Contents

- `.pi/extensions`: ask-user-question, btw, markdown-preview, mermaid, prompt-box, tps, work-timer, pi-tool-display (vendored), pi-tool-display-codex
- `.pi/skills`, `.pi/themes`, `.pi/AGENTS.md`
- Only npm package installed globally: `@juicesharp/rpiv-web-tools`
