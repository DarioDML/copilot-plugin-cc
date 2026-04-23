/**
 * Git utilities for the copilot-companion.
 */

import { execFileSync } from "node:child_process";

/**
 * Check whether the given directory is inside a git repository.
 */
export function isGitRepository(cwd) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Throw if cwd is not a git repository.
 */
export function ensureGitRepository(cwd) {
  if (!isGitRepository(cwd)) {
    throw new Error(
      "Not a git repository. Run this command inside a git-tracked project."
    );
  }
}

/**
 * Get the current branch name.
 */
export function getCurrentBranch(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get short status lines.
 */
export function getGitStatus(cwd) {
  try {
    return execFileSync(
      "git",
      ["status", "--short", "--untracked-files=all"],
      { cwd, encoding: "utf8" }
    ).trim();
  } catch {
    return "";
  }
}

/**
 * Get diff shortstat for staged changes.
 */
export function getStagedShortstat(cwd) {
  try {
    return execFileSync("git", ["diff", "--shortstat", "--cached"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Get diff shortstat for unstaged changes.
 */
export function getUnstagedShortstat(cwd) {
  try {
    return execFileSync("git", ["diff", "--shortstat"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Get diff shortstat between a base ref and HEAD.
 */
export function getBranchShortstat(cwd, baseRef) {
  try {
    return execFileSync("git", ["diff", "--shortstat", `${baseRef}...HEAD`], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Get unified diff content for the working tree.
 */
export function getWorkingTreeDiff(cwd) {
  try {
    const staged = execFileSync("git", ["diff", "--cached"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const unstaged = execFileSync("git", ["diff"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return (staged + "\n" + unstaged).trim();
  } catch {
    return "";
  }
}

/**
 * Get unified diff between a base ref and HEAD.
 */
export function getBranchDiff(cwd, baseRef) {
  try {
    return execFileSync("git", ["diff", `${baseRef}...HEAD`], {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Resolve which review target to use based on options.
 *
 * Returns { mode: "working-tree" | "branch", baseRef?, label }.
 */
export function resolveReviewTarget(cwd, options = {}) {
  const scope = options.scope ?? "auto";
  const base = options.base ?? null;

  if (base) {
    return {
      mode: "branch",
      baseRef: base,
      label: `branch diff against ${base}`,
    };
  }

  if (scope === "branch") {
    // Try to detect upstream
    const upstream = detectUpstream(cwd);
    if (!upstream) {
      throw new Error(
        "Cannot determine base branch. Use --base <ref> explicitly."
      );
    }
    return {
      mode: "branch",
      baseRef: upstream,
      label: `branch diff against ${upstream}`,
    };
  }

  // default: working-tree
  return {
    mode: "working-tree",
    label: "uncommitted changes (working tree)",
  };
}

/**
 * Detect the upstream tracking branch.
 */
function detectUpstream(cwd) {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--abbrev-ref", "@{upstream}"],
      { cwd, encoding: "utf8" }
    ).trim();
  } catch {
    // Fallback: try main or master
    for (const candidate of ["main", "master"]) {
      try {
        execFileSync("git", ["rev-parse", "--verify", candidate], {
          cwd,
          stdio: ["ignore", "pipe", "ignore"],
        });
        return candidate;
      } catch {
        // continue
      }
    }
    return null;
  }
}

/**
 * Collect review context: diff content, branch, summary.
 */
export function collectReviewContext(cwd, target) {
  const branch = getCurrentBranch(cwd) ?? "unknown";
  let content = "";
  let summary = "";

  if (target.mode === "working-tree") {
    content = getWorkingTreeDiff(cwd);
    const status = getGitStatus(cwd);
    const staged = getStagedShortstat(cwd);
    const unstaged = getUnstagedShortstat(cwd);
    summary = [status, staged, unstaged].filter(Boolean).join("\n");
  } else {
    content = getBranchDiff(cwd, target.baseRef);
    summary = getBranchShortstat(cwd, target.baseRef);
  }

  return {
    repoRoot: cwd,
    branch,
    target,
    content,
    summary,
    collectionGuidance:
      target.mode === "working-tree"
        ? "Review all staged and unstaged changes in the working tree."
        : `Review all changes between ${target.baseRef} and HEAD.`,
  };
}

/**
 * Estimate whether the review is "tiny" (1-2 files, small diff).
 */
export function estimateReviewSize(cwd, target) {
  const status = getGitStatus(cwd);
  const statusLines = status.split("\n").filter(Boolean);

  if (target.mode === "working-tree") {
    const staged = getStagedShortstat(cwd);
    const unstaged = getUnstagedShortstat(cwd);
    const hasUntracked = statusLines.some((l) => l.startsWith("?"));
    const hasDiff = Boolean(staged || unstaged);

    if (!hasDiff && !hasUntracked && statusLines.length === 0) {
      return { empty: true, tiny: false };
    }
    if (statusLines.length <= 2 && !hasUntracked) {
      return { empty: false, tiny: true };
    }
    return { empty: false, tiny: false };
  }

  const branchStat = getBranchShortstat(cwd, target.baseRef);
  if (!branchStat) {
    return { empty: true, tiny: false };
  }
  // Parse "N files changed" to estimate
  const match = branchStat.match(/(\d+)\s+files?\s+changed/);
  if (match && parseInt(match[1], 10) <= 2) {
    return { empty: false, tiny: true };
  }
  return { empty: false, tiny: false };
}
