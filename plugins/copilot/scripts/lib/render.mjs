/**
 * Output rendering for copilot-companion results.
 */

export function renderSetupReport(report) {
  const lines = ["## Copilot Setup Status\n"];
  lines.push(`- **Node.js**: ${report.node.available ? `✅ ${report.node.version}` : "❌ Not found"}`);
  lines.push(`- **npm**: ${report.npm.available ? `✅ ${report.npm.version}` : "❌ Not found"}`);
  lines.push(`- **Copilot CLI**: ${report.copilot.available ? `✅ ${report.copilot.version}` : "❌ Not installed"}`);
  lines.push(`- **Auth**: ${report.auth.loggedIn ? `✅ Authenticated (${report.auth.tokenSource})` : "❌ Not authenticated"}`);
  lines.push(`\n**Ready**: ${report.ready ? "✅ Yes" : "❌ No"}`);
  if (report.nextSteps.length > 0) {
    lines.push("\n### Next Steps");
    report.nextSteps.forEach((s) => lines.push(`- ${s}`));
  }
  return lines.join("\n") + "\n";
}

export function renderReviewResult(result, opts = {}) {
  const lines = [];
  const label = opts.reviewLabel ?? "Review";
  lines.push(`## Copilot ${label}\n`);
  if (opts.targetLabel) lines.push(`**Target**: ${opts.targetLabel}\n`);
  if (result.status !== 0) {
    lines.push(`⚠️ Copilot exited with status ${result.status}\n`);
    if (result.stderr) lines.push("```\n" + result.stderr + "\n```\n");
  }
  if (result.reviewText) {
    lines.push(result.reviewText);
  } else {
    lines.push("_No review output produced._");
  }
  return lines.join("\n") + "\n";
}

export function renderTaskResult(result, opts = {}) {
  const lines = [];
  lines.push(`## ${opts.title ?? "Copilot Task"}\n`);
  if (opts.jobId) lines.push(`**Job**: ${opts.jobId}\n`);
  if (result.status !== 0) {
    lines.push(`⚠️ Copilot exited with status ${result.status}\n`);
    if (result.failureMessage) lines.push("```\n" + result.failureMessage + "\n```\n");
  }
  if (result.rawOutput) {
    lines.push(result.rawOutput);
  } else {
    lines.push("_No output produced._");
  }
  return lines.join("\n") + "\n";
}

export function renderStatusReport(jobs) {
  if (!jobs || jobs.length === 0) return "No Copilot jobs found for this session.\n";
  const lines = ["| Job ID | Kind | Status | Summary |", "| --- | --- | --- | --- |"];
  for (const j of jobs) {
    lines.push(`| ${j.id} | ${j.kind ?? "-"} | ${j.status ?? "-"} | ${j.summary ?? "-"} |`);
  }
  return lines.join("\n") + "\n";
}

export function renderCancelReport(job) {
  return `Cancelled job **${job.id}** (${job.title ?? "unknown"}).\n`;
}

export function renderJobResult(job, detail) {
  const lines = [`## Job ${job.id}\n`];
  lines.push(`- **Kind**: ${job.kind ?? "-"}`);
  lines.push(`- **Status**: ${job.status ?? "-"}`);
  lines.push(`- **Title**: ${job.title ?? "-"}`);
  if (job.completedAt) lines.push(`- **Completed**: ${job.completedAt}`);
  if (detail?.output) {
    lines.push("\n### Output\n");
    lines.push(detail.output);
  }
  return lines.join("\n") + "\n";
}
