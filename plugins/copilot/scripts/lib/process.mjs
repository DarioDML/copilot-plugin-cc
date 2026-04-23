/**
 * Process management utilities.
 */

import { execFileSync } from "node:child_process";

/**
 * Check whether a binary is available on the system PATH.
 *
 * @param {string} name   — binary name (e.g. "copilot", "node")
 * @param {string[]} args — args for a quick check (e.g. ["--version"])
 * @param {object} [opts]
 * @returns {{ available: boolean, version?: string }}
 */
export function binaryAvailable(name, args = ["--version"], opts = {}) {
  try {
    const output = execFileSync(name, args, {
      cwd: opts.cwd ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
    return { available: true, version: output };
  } catch {
    return { available: false };
  }
}

/**
 * Terminate a process and its children (best-effort).
 */
export function terminateProcessTree(pid) {
  if (!pid || !Number.isFinite(pid)) {
    return;
  }
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // already gone
        }
      }, 3000);
    }
  } catch {
    // Process already exited
  }
}
