import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parsePythonVersion(value) {
  const match = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0)
  };
}

export function supportsPython(version) {
  return Boolean(version && (version.major > 3 || (version.major === 3 && version.minor >= 10)));
}

export function runtimeHome({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.CHILON_RECALL_HOME) return path.resolve(env.CHILON_RECALL_HOME);
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Chilon Recall");
  }
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Chilon Recall");
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "chilon-recall");
}

export function venvDir(options = {}) {
  return path.join(runtimeHome(options), "engine");
}

export function venvPython(options = {}) {
  return (options.platform || process.platform) === "win32"
    ? path.join(venvDir(options), "Scripts", "python.exe")
    : path.join(venvDir(options), "bin", "python");
}

export async function fileExists(target) {
  try {
    return (await fs.stat(target)).isFile();
  } catch {
    return false;
  }
}

export function runProcess(command, args, { cwd = packageRoot, env = process.env, timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs} ms.`));
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
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}.\n${stderr || stdout}`.trim()));
    });
  });
}

function bootstrapCandidates({ env = process.env, platform = process.platform } = {}) {
  const candidates = [];
  if (env.CHILON_RECALL_BOOTSTRAP_PYTHON) {
    candidates.push({ command: env.CHILON_RECALL_BOOTSTRAP_PYTHON, args: [] });
  }
  if (platform === "win32") {
    candidates.push({ command: "python", args: [] }, { command: "py", args: ["-3"] });
  } else {
    candidates.push({ command: "python3", args: [] }, { command: "python", args: [] });
  }
  return candidates;
}

export async function findBootstrapPython(options = {}) {
  const attempts = [];
  for (const candidate of bootstrapCandidates(options)) {
    try {
      const result = await runProcess(candidate.command, [...candidate.args, "--version"], options);
      const version = parsePythonVersion(`${result.stdout}\n${result.stderr}`);
      if (supportsPython(version)) return { ...candidate, version };
      attempts.push(`${candidate.command} reports an unsupported version`);
    } catch {
      attempts.push(`${candidate.command} was not available`);
    }
  }
  throw new Error(`Python 3.10+ is required to install the Chilon Recall engine. ${attempts.join("; ")}`);
}

export async function resolveEnginePython(options = {}) {
  if (options.env?.CHILON_RECALL_PYTHON || process.env.CHILON_RECALL_PYTHON) {
    return options.env?.CHILON_RECALL_PYTHON || process.env.CHILON_RECALL_PYTHON;
  }
  const installed = venvPython(options);
  if (await fileExists(installed)) return installed;
  throw new Error("Python engine is not installed. Run `chilon-recall setup` before starting the MCP server.");
}

export async function setupEngine(options = {}) {
  const env = options.env || process.env;
  const root = options.packageRoot || packageRoot;
  const runtime = runtimeHome(options);
  const environment = venvDir(options);
  const enginePython = venvPython(options);
  const bootstrap = await findBootstrapPython({ ...options, env });
  await fs.mkdir(runtime, { recursive: true });
  if (!(await fileExists(enginePython))) {
    await runProcess(bootstrap.command, [...bootstrap.args, "-m", "venv", environment], { ...options, env });
  }
  await runProcess(
    enginePython,
    ["-m", "pip", "install", "--disable-pip-version-check", "--upgrade", path.resolve(root)],
    { ...options, env, timeoutMs: 20 * 60 * 1000 }
  );
  await runProcess(enginePython, ["-c", "import faiss, httpx, numpy, chilon_recall; print('ok')"], {
    ...options,
    env
  });
  return {
    runtime_home: runtime,
    python: enginePython,
    bootstrap_python: bootstrap.command,
    python_version: `${bootstrap.version.major}.${bootstrap.version.minor}.${bootstrap.version.patch}`
  };
}
