/**
 * Copilot CLI interface — spawn and interact with the `copilot` binary.
 */

import { spawn } from "node:child_process";
import { binaryAvailable } from "./process.mjs";

const COPILOT_BIN = "copilot";

/**
 * Check if the Copilot CLI is installed.
 */
export function getCopilotAvailability(cwd) {
  return binaryAvailable(COPILOT_BIN, ["--version"], { cwd });
}

/**
 * Check Copilot authentication status.
 * The CLI uses COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN env vars,
 * or falls back to gh CLI auth.
 */
export function getCopilotAuthStatus(cwd) {
  const tokenEnvVars = [
    "COPILOT_GITHUB_TOKEN",
    "GH_TOKEN",
    "GITHUB_TOKEN",
  ];

  // Check if any token env var is set
  const hasToken = tokenEnvVars.some((v) => Boolean(process.env[v]));

  // Check if gh CLI is authenticated
  let ghAuthenticated = false;
  try {
    const result = binaryAvailable("gh", ["auth", "status"], { cwd });
    ghAuthenticated = result.available;
  } catch {
    // gh not installed or not authenticated
  }

  return {
    loggedIn: hasToken || ghAuthenticated,
    hasToken,
    ghAuthenticated,
    tokenSource: hasToken
      ? tokenEnvVars.find((v) => Boolean(process.env[v]))
      : ghAuthenticated
        ? "gh-cli"
        : null,
  };
}

/**
 * Run a Copilot CLI prompt in non-interactive mode.
 *
 * @param {string} cwd        — working directory
 * @param {string} prompt     — the prompt to send
 * @param {object} [options]
 * @param {function} [options.onProgress] — called with progress chunks
 * @param {AbortSignal} [options.signal]  — abort signal
 * @returns {Promise<{ status: number, stdout: string, stderr: string, pid: number }>}
 */
export function runCopilotPrompt(cwd, prompt, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    if (process.platform === "win32") {
      const escapedPrompt = JSON.stringify(prompt);
      child = spawn(`${COPILOT_BIN} -p ${escapedPrompt} --allow-all-tools`, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        shell: true,
      });
    } else {
      const args = ["-p", prompt, "--allow-all-tools"];
      child = spawn(COPILOT_BIN, args, {
        cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        shell: false,
      });
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onProgress?.({ type: "stdout", text });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onProgress?.({ type: "stderr", text });
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }

    child.on("error", (err) => {
      reject(
        new Error(`Failed to spawn Copilot CLI: ${err.message}`)
      );
    });

    child.on("close", (code) => {
      resolve({
        status: code ?? 1,
        stdout,
        stderr,
        pid: child.pid,
      });
    });
  });
}

/**
 * Run a Copilot review by building a review prompt from diff context.
 */
export async function runCopilotReview(cwd, reviewPrompt, options = {}) {
  const result = await runCopilotPrompt(cwd, reviewPrompt, options);
  return {
    status: result.status,
    reviewText: result.stdout,
    stderr: result.stderr,
    pid: result.pid,
  };
}

/**
 * Run a Copilot task (rescue/delegate).
 */
export async function runCopilotTask(cwd, taskPrompt, options = {}) {
  const result = await runCopilotPrompt(cwd, taskPrompt, options);
  return {
    status: result.status,
    output: result.stdout,
    stderr: result.stderr,
    pid: result.pid,
  };
}
