/**
 * Job state persistence.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const STATE_DIR = ".copilot-plugin";
const JOBS_FILE = "jobs.json";

export function resolveWorkspaceRoot(cwd) {
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const p = path.dirname(dir);
    if (p === dir) return path.resolve(cwd);
    dir = p;
  }
}

function ensureDir(workspaceRoot) {
  const d = path.join(workspaceRoot, STATE_DIR);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function generateJobId(prefix = "job") {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

export function listJobs(workspaceRoot) {
  const f = path.join(workspaceRoot, STATE_DIR, JOBS_FILE);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return []; }
}

function writeJobs(workspaceRoot, jobs) {
  ensureDir(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, STATE_DIR, JOBS_FILE), JSON.stringify(jobs, null, 2));
}

export function upsertJob(workspaceRoot, job) {
  const jobs = listJobs(workspaceRoot);
  const i = jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) jobs[i] = { ...jobs[i], ...job }; else jobs.push(job);
  writeJobs(workspaceRoot, jobs);
}

export function writeJobFile(workspaceRoot, jobId, data) {
  const d = path.join(ensureDir(workspaceRoot), "jobs");
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${jobId}.json`), JSON.stringify(data, null, 2));
}

export function readJobFile(workspaceRoot, jobId) {
  const f = path.join(workspaceRoot, STATE_DIR, "jobs", `${jobId}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}

export function getConfig(workspaceRoot) {
  const f = path.join(workspaceRoot, STATE_DIR, "config.json");
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; }
}

export function setConfig(workspaceRoot, key, value) {
  const c = getConfig(workspaceRoot);
  c[key] = value;
  ensureDir(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, STATE_DIR, "config.json"), JSON.stringify(c, null, 2));
}
