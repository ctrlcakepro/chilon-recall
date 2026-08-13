import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonPackageRoot = path.join(projectRoot, "python");

function pythonCommand(env = process.env) {
  if (env.CHILON_RECALL_PYTHON) return env.CHILON_RECALL_PYTHON;
  return process.platform === "win32" ? "python" : "python3";
}

function redact(text, env = process.env) {
  let result = text;
  for (const [key, value] of Object.entries(env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(key) && typeof value === "string" && value.length >= 8) {
      result = result.split(value).join("[REDACTED]");
    }
  }
  return result;
}

export function runEngine(args, { timeoutMs = 120_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const separator = process.platform === "win32" ? ";" : ":";
    const childEnv = {
      ...env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      PYTHONPATH: env.PYTHONPATH
        ? `${pythonPackageRoot}${separator}${env.PYTHONPATH}`
        : pythonPackageRoot
    };
    const child = spawn(pythonCommand(env), ["-m", "chilon_recall.cli", ...args], {
      cwd: projectRoot,
      env: childEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Python engine timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(redact(stderr || stdout || `Python engine exited with code ${code}.`, env)));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Python engine returned invalid JSON: ${redact(stdout, env)}`));
      }
    });
  });
}

export function buildIndex(config, outputDir) {
  return runEngine(
    ["build", "--config", config.configPath, "--output", outputDir],
    { timeoutMs: 30 * 60 * 1000 }
  );
}

export function queryIndex(config, question, { top, candidates } = {}) {
  const args = ["query", "--config", config.configPath, "--question", question];
  if (top !== undefined) args.push("--top", String(top));
  if (candidates !== undefined) args.push("--candidates", String(candidates));
  return runEngine(args, { timeoutMs: 2 * 60 * 1000 });
}
