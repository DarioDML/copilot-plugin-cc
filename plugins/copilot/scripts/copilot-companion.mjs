#!/usr/bin/env node
/**
 * copilot-companion.mjs — Main CLI entry point for the Claude Code Copilot plugin.
 *
 * Subcommands: setup, review, adversarial-review, task, status, result, cancel
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs, splitRawArgumentString } from "./lib/args.mjs";
import { getCopilotAvailability, getCopilotAuthStatus, runCopilotReview, runCopilotTask } from "./lib/copilot.mjs";
import { ensureGitRepository, resolveReviewTarget, collectReviewContext, estimateReviewSize } from "./lib/git.mjs";
import { binaryAvailable, terminateProcessTree } from "./lib/process.mjs";
import { resolveWorkspaceRoot, generateJobId, listJobs, upsertJob, writeJobFile, readJobFile, getConfig, setConfig } from "./lib/state.mjs";
import { renderSetupReport, renderReviewResult, renderTaskResult, renderStatusReport, renderCancelReport, renderJobResult } from "./lib/render.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/copilot-companion.mjs setup [--json]",
    "  node scripts/copilot-companion.mjs review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>]",
    "  node scripts/copilot-companion.mjs adversarial-review [--wait|--background] [--base <ref>] [--scope <auto|working-tree|branch>] [focus text]",
    "  node scripts/copilot-companion.mjs task [--background] [--write] [prompt]",
    "  node scripts/copilot-companion.mjs status [job-id] [--all] [--json]",
    "  node scripts/copilot-companion.mjs result [job-id] [--json]",
    "  node scripts/copilot-companion.mjs cancel [job-id] [--json]",
  ].join("\n"));
}

function normalizeArgv(argv) {
  if (argv.length === 1 && argv[0]) return splitRawArgumentString(argv[0]);
  return argv;
}

function parseCommandInput(argv, config = {}) {
  return parseArgs(normalizeArgv(argv), config);
}

function resolveCwd(options) {
  return options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd();
}

function output(value, asJson) {
  if (asJson) console.log(JSON.stringify(value, null, 2));
  else process.stdout.write(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function nowIso() { return new Date().toISOString(); }

// ── setup ───────────────────────────────────────────────────────────────────
async function handleSetup(argv) {
  const { options } = parseCommandInput(argv, { booleanOptions: ["json"], valueOptions: ["cwd"] });
  const cwd = resolveCwd(options);
  const node = binaryAvailable("node", ["--version"], { cwd });
  const npm = binaryAvailable("npm", ["--version"], { cwd });
  const copilot = getCopilotAvailability(cwd);
  const auth = getCopilotAuthStatus(cwd);

  const nextSteps = [];
  if (!copilot.available) nextSteps.push("Install Copilot CLI: `npm install -g @github/copilot`");
  if (copilot.available && !auth.loggedIn) nextSteps.push("Authenticate: run `copilot` and use `/login`, or set COPILOT_GITHUB_TOKEN env var.");

  const report = { ready: node.available && copilot.available && auth.loggedIn, node, npm, copilot, auth, nextSteps };
  output(options.json ? report : renderSetupReport(report), options.json);
}

// ── review ──────────────────────────────────────────────────────────────────
async function handleReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["base", "scope", "cwd"], booleanOptions: ["json", "background", "wait"]
  });
  const cwd = resolveCwd(options);
  ensureGitRepository(cwd);
  const target = resolveReviewTarget(cwd, { base: options.base, scope: options.scope });
  const context = collectReviewContext(cwd, target);

  if (!context.content && !context.summary) {
    output("Nothing to review — no changes detected.\n", false);
    return;
  }

  const prompt = buildReviewPrompt(context, "Code Review");
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const job = { id: generateJobId("review"), kind: "review", status: "running", title: "Copilot Review", summary: `Review ${target.label}`, startedAt: nowIso() };
  upsertJob(workspaceRoot, job);

  const result = await runCopilotReview(cwd, prompt);
  const completedJob = { ...job, status: result.status === 0 ? "completed" : "failed", completedAt: nowIso() };
  upsertJob(workspaceRoot, completedJob);
  writeJobFile(workspaceRoot, job.id, { ...completedJob, output: result.reviewText, stderr: result.stderr });

  output(options.json ? { ...completedJob, output: result.reviewText } : renderReviewResult(result, { reviewLabel: "Review", targetLabel: target.label }), options.json);
}

// ── adversarial-review ──────────────────────────────────────────────────────
async function handleAdversarialReview(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["base", "scope", "cwd"], booleanOptions: ["json", "background", "wait"]
  });
  const cwd = resolveCwd(options);
  ensureGitRepository(cwd);
  const target = resolveReviewTarget(cwd, { base: options.base, scope: options.scope });
  const context = collectReviewContext(cwd, target);
  const focusText = positionals.join(" ").trim();

  if (!context.content && !context.summary) {
    output("Nothing to review — no changes detected.\n", false);
    return;
  }

  const prompt = buildAdversarialPrompt(context, focusText);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const job = { id: generateJobId("areview"), kind: "adversarial-review", status: "running", title: "Copilot Adversarial Review", summary: `Adversarial review ${target.label}`, startedAt: nowIso() };
  upsertJob(workspaceRoot, job);

  const result = await runCopilotReview(cwd, prompt);
  const completedJob = { ...job, status: result.status === 0 ? "completed" : "failed", completedAt: nowIso() };
  upsertJob(workspaceRoot, completedJob);
  writeJobFile(workspaceRoot, job.id, { ...completedJob, output: result.reviewText, stderr: result.stderr });

  output(options.json ? { ...completedJob, output: result.reviewText } : renderReviewResult(result, { reviewLabel: "Adversarial Review", targetLabel: target.label }), options.json);
}

// ── task ─────────────────────────────────────────────────────────────────────
async function handleTask(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"], booleanOptions: ["json", "background", "write"]
  });
  const cwd = resolveCwd(options);
  const prompt = positionals.join(" ").trim();
  if (!prompt) { throw new Error("Provide a task prompt. Example: node copilot-companion.mjs task 'fix the failing test'"); }

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const job = { id: generateJobId("task"), kind: "task", status: "running", title: "Copilot Task", summary: prompt.slice(0, 96), startedAt: nowIso() };
  upsertJob(workspaceRoot, job);

  if (options.background) {
    // Spawn detached worker
    const script = path.join(ROOT_DIR, "scripts", "copilot-companion.mjs");
    const child = spawn(process.execPath, [script, "task-worker", "--cwd", cwd, "--job-id", job.id, "--prompt", prompt], {
      cwd, env: process.env, detached: true, stdio: "ignore", windowsHide: true
    });
    child.unref();
    upsertJob(workspaceRoot, { ...job, status: "queued", pid: child.pid });
    output(options.json ? { jobId: job.id, status: "queued" } : `Copilot task started in background as **${job.id}**. Check \`/copilot:status ${job.id}\` for progress.\n`, options.json);
    return;
  }

  const result = await runCopilotTask(cwd, prompt);
  const completedJob = { ...job, status: result.status === 0 ? "completed" : "failed", completedAt: nowIso() };
  upsertJob(workspaceRoot, completedJob);
  writeJobFile(workspaceRoot, job.id, { ...completedJob, output: result.output, stderr: result.stderr });

  output(options.json ? { ...completedJob, output: result.output } : renderTaskResult({ status: result.status, rawOutput: result.output, failureMessage: result.stderr }, { title: "Copilot Task", jobId: job.id }), options.json);
}

// ── task-worker (background) ────────────────────────────────────────────────
async function handleTaskWorker(argv) {
  const { options } = parseCommandInput(argv, { valueOptions: ["cwd", "job-id", "prompt"] });
  if (!options["job-id"] || !options.prompt) throw new Error("Missing --job-id or --prompt");
  const cwd = resolveCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  upsertJob(workspaceRoot, { id: options["job-id"], status: "running" });
  const result = await runCopilotTask(cwd, options.prompt);
  const status = result.status === 0 ? "completed" : "failed";
  upsertJob(workspaceRoot, { id: options["job-id"], status, completedAt: nowIso() });
  writeJobFile(workspaceRoot, options["job-id"], { status, output: result.output, stderr: result.stderr });
}

// ── status ──────────────────────────────────────────────────────────────────
function handleStatus(argv) {
  const { options, positionals } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json", "all"] });
  const cwd = resolveCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const ref = positionals[0];

  if (ref) {
    const jobs = listJobs(workspaceRoot);
    const job = jobs.find((j) => j.id === ref);
    if (!job) { output(`Job ${ref} not found.\n`, false); return; }
    const detail = readJobFile(workspaceRoot, ref);
    output(options.json ? { job, detail } : renderJobResult(job, detail), options.json);
    return;
  }

  const jobs = listJobs(workspaceRoot).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  output(options.json ? jobs : renderStatusReport(jobs), options.json);
}

// ── result ──────────────────────────────────────────────────────────────────
function handleResult(argv) {
  const { options, positionals } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const ref = positionals[0] ?? "";
  const jobs = listJobs(workspaceRoot).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

  let job;
  if (ref) { job = jobs.find((j) => j.id === ref); }
  else { job = jobs.find((j) => j.status === "completed" || j.status === "failed"); }
  if (!job) { output("No completed job found.\n", false); return; }

  const detail = readJobFile(workspaceRoot, job.id);
  output(options.json ? { job, detail } : renderJobResult(job, detail), options.json);
}

// ── cancel ──────────────────────────────────────────────────────────────────
function handleCancel(argv) {
  const { options, positionals } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const ref = positionals[0] ?? "";
  const jobs = listJobs(workspaceRoot);

  let job;
  if (ref) { job = jobs.find((j) => j.id === ref); }
  else { job = jobs.find((j) => j.status === "running" || j.status === "queued"); }
  if (!job) { output("No active job to cancel.\n", false); return; }

  terminateProcessTree(job.pid);
  const cancelled = { ...job, status: "cancelled", completedAt: nowIso(), errorMessage: "Cancelled by user." };
  upsertJob(workspaceRoot, cancelled);
  writeJobFile(workspaceRoot, job.id, cancelled);
  output(options.json ? cancelled : renderCancelReport(cancelled), options.json);
}

// ── Prompt builders ─────────────────────────────────────────────────────────
function buildReviewPrompt(context, label) {
  return `You are performing a ${label} of the following code changes.

Target: ${context.target.label}
Branch: ${context.branch}

${context.collectionGuidance}

Here is a summary of the changes:
${context.summary || "(no summary)"}

Here is the full diff:
\`\`\`diff
${context.content || "(empty diff)"}
\`\`\`

Please review these changes thoroughly. Report bugs, security issues, performance problems, code style issues, and potential improvements. Be specific with file names and line numbers. Do not suggest fixes — only identify issues.`;
}

function buildAdversarialPrompt(context, focusText) {
  return `You are performing an Adversarial Review — a challenge review that questions the implementation approach, design choices, tradeoffs, and assumptions.

Target: ${context.target.label}
Branch: ${context.branch}
${focusText ? `\nFocus area: ${focusText}` : ""}

${context.collectionGuidance}

Summary:
${context.summary || "(no summary)"}

Full diff:
\`\`\`diff
${context.content || "(empty diff)"}
\`\`\`

Challenge this implementation:
1. Is this the right approach? What alternatives were available?
2. What assumptions does this depend on? Could they break?
3. Where could this design fail under real-world conditions?
4. What edge cases or failure modes are unaddressed?
5. Are there simpler solutions that would achieve the same goal?

Be rigorous and specific. Reference files and line numbers.`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);
  if (!subcommand || subcommand === "help" || subcommand === "--help") { printUsage(); return; }

  switch (subcommand) {
    case "setup": await handleSetup(argv); break;
    case "review": await handleReview(argv); break;
    case "adversarial-review": await handleAdversarialReview(argv); break;
    case "task": await handleTask(argv); break;
    case "task-worker": await handleTaskWorker(argv); break;
    case "status": handleStatus(argv); break;
    case "result": handleResult(argv); break;
    case "cancel": handleCancel(argv); break;
    default: throw new Error(`Unknown subcommand: ${subcommand}`);
  }
}

main().catch((err) => { process.stderr.write(`${err.message}\n`); process.exitCode = 1; });
