---
description: Delegate investigation, a fix request, or coding work to Copilot
argument-hint: "[--background|--wait] [what Copilot should investigate, solve, or build]"
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Invoke the `copilot:copilot-rescue` subagent via the `Agent` tool (`subagent_type: "copilot:copilot-rescue"`), forwarding the raw user request as the prompt.
`copilot:copilot-rescue` is a subagent, not a skill — do not call `Skill(copilot:copilot-rescue)` or `Skill(copilot:rescue)`.
The final user-visible response must be Copilot's output verbatim.

Raw user request:
$ARGUMENTS

Execution mode:

- If the request includes `--background`, run the `copilot:copilot-rescue` subagent in the background.
- If the request includes `--wait`, run the `copilot:copilot-rescue` subagent in the foreground.
- If neither flag is present, default to foreground.
- `--background` and `--wait` are execution flags for Claude Code. Do not forward them to `task`, and do not treat them as part of the natural-language task text.

Operating rules:

- The subagent is a thin forwarder only. It should use one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/copilot-companion.mjs" task ...` and return that command's stdout as-is.
- Return the Copilot companion stdout verbatim to the user.
- Do not paraphrase, summarize, rewrite, or add commentary before or after it.
- Do not ask the subagent to inspect files, monitor progress, poll `/copilot:status`, fetch `/copilot:result`, call `/copilot:cancel`, summarize output, or do follow-up work of its own.
- If the companion reports that Copilot is missing or unauthenticated, stop and tell the user to run `/copilot:setup`.
- If the user did not supply a request, ask what Copilot should investigate or fix.
