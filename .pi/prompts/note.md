---
description: Capture a non-obvious finding to docs/notes/ as a persistent project note.
---

You are about to write a project note. The user will give a topic; you will:

1. Pick a kebab-case slug for the filename: `docs/notes/<slug>.md`.
2. If a note already exists on the same topic, **append/update** rather than duplicate.
3. Keep the note short (5–30 lines). Structure:
   ```
   # <title>

   <one-sentence summary>

   ## Why this matters
   <when this knowledge is needed>

   ## Details
   <facts, gotchas, code refs with file:line>

   ## Source
   <commit, issue, file path, or "discovered $(date) during $task">
   ```
4. Do NOT pad. If there's nothing non-obvious to say, tell the user - don't write a stub.

Topic: $ARGUMENTS
