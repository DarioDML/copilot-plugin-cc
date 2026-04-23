---
description: Check whether the local Copilot CLI is ready and authenticated
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-companion.mjs" setup --json
```

If the result says Copilot CLI is unavailable and npm is available:
- Use `AskUserQuestion` exactly once to ask whether Claude should install the Copilot CLI now.
- Put the install option first and suffix it with `(Recommended)`.
- Use these two options:
  - `Install Copilot CLI (Recommended)`
  - `Skip for now`
- If the user chooses install, run:

```bash
npm install -g @github/copilot
```

- Then rerun:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-companion.mjs" setup --json
```

If the Copilot CLI is already installed or npm is unavailable:
- Do not ask about installation.

Output rules:
- Present the final setup output to the user.
- If installation was skipped, present the original setup output.
- If Copilot is installed but not authenticated, tell the user to run `copilot` and use `/login`, or set the `COPILOT_GITHUB_TOKEN` environment variable.
