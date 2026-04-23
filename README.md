# copilot-plugin-cc

A **Claude Code plugin** that lets you use **GitHub Copilot CLI** from within Claude Code — for code reviews, adversarial design challenges, and task delegation.

> Inspired by [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc), which bridges Claude Code → Codex. This plugin bridges Claude Code → GitHub Copilot instead.

## Prerequisites

- **Claude Code** (with plugin support)
- **Node.js** ≥ 18.18
- **GitHub Copilot CLI** — install with:
  ```bash
  npm install -g @github/copilot
  ```
- **GitHub authentication** — run `copilot` and use `/login`, or set `COPILOT_GITHUB_TOKEN`

## Installation

From Claude Code, install the plugin:

```
/plugin install copilot@https://github.com/yourusername/copilot-plugin-cc
```

Or install from a local checkout:

```
/plugin install copilot@./path/to/copilot-plugin-cc
```

## Commands

| Command | Description |
| --- | --- |
| `/copilot:setup` | Check if the Copilot CLI is installed and authenticated |
| `/copilot:review` | Run a code review on your uncommitted changes |
| `/copilot:review --base main` | Review your branch diff against `main` |
| `/copilot:adversarial-review` | Challenge your implementation and design choices |
| `/copilot:rescue <task>` | Delegate a task to Copilot (investigate, fix, build) |
| `/copilot:status` | Show active and recent Copilot jobs |
| `/copilot:result [job-id]` | Show output of a completed job |
| `/copilot:cancel [job-id]` | Cancel a running background job |

## Examples

```
# Check setup
/copilot:setup

# Review working tree changes
/copilot:review

# Review branch vs main
/copilot:review --base main

# Challenge the design
/copilot:adversarial-review focus on error handling

# Delegate a task
/copilot:rescue fix the failing unit tests in src/utils

# Check on background jobs
/copilot:status

# Get the result
/copilot:result
```

## How It Works

1. Claude Code reads the plugin's command markdown files
2. When you run `/copilot:review`, Claude executes the companion script
3. The companion script invokes `copilot -p "<review prompt>"` with your diff context
4. Copilot CLI processes the request and returns its analysis
5. Claude presents the output verbatim in your session

```
┌──────────────┐    /copilot:review    ┌────────────────────┐
│  Claude Code │ ────────────────────► │ copilot-companion  │
│              │                       │     .mjs           │
│  (your AI    │ ◄──────────────────── │                    │
│   session)   │   verbatim output     │  spawns copilot    │
└──────────────┘                       │  CLI process       │
                                       └─────────┬──────────┘
                                                  │
                                                  ▼
                                       ┌────────────────────┐
                                       │  GitHub Copilot    │
                                       │  CLI (@github/     │
                                       │  copilot)          │
                                       └────────────────────┘
```

## License

Apache-2.0
