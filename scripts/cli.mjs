#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readConfig, resolveConfigPath } from "../src/config.mjs";
import {
  fileExists,
  findBootstrapPython,
  packageRoot,
  resolveEnginePython,
  runtimeHome,
  runProcess,
  setupEngine,
  venvPython
} from "../src/runtime.mjs";
import { installQoder } from "../src/qoder.mjs";
import { startStdioServer } from "../src/server.mjs";

const help = `Chilon Recall — local-first MCP knowledge retrieval

Usage:
  chilon-recall install <directory> [--force]
                                      Create a private config and install the Python engine.
  chilon-recall init <directory> [--force]
                                      Create a private config in a document directory.
  chilon-recall qoder <directory> [--force]
                                      Generate the Qoder IDE surface (.qoder/mcp.json, skills, rules).
  chilon-recall setup       Create or update the isolated Python engine.
  chilon-recall doctor      Check Node, Python engine, and private configuration.
  chilon-recall mcp         Start the stdio MCP server (the default command).

Environment:
  RAG_MANAGER_CONFIG              Absolute path to the private JSON configuration.
  RAG_API_KEY                     Embedding provider credential.
  RAG_RERANK_API_KEY              Optional reranker credential.
  CHILON_RECALL_HOME              Override the persistent engine directory.
  CHILON_RECALL_PYTHON            Use an existing Python runtime instead of the managed one.
  CHILON_RECALL_BOOTSTRAP_PYTHON  Python 3.10+ executable used by setup.
`;

async function packageVersion() {
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
  return manifest.version;
}

export async function initializeConfig(directory, { force = false } = {}) {
  const targetDirectory = path.resolve(directory || process.cwd());
  const configPath = path.join(targetDirectory, "chilon-recall.json");
  try {
    await fs.access(configPath);
    if (!force) {
      throw new Error(`Configuration already exists: ${configPath}. Re-run with --force only if you intend to replace it.`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.mkdir(targetDirectory, { recursive: true });
  const templatePath = path.join(packageRoot, "config", "chilon-recall.example.json");
  const config = JSON.parse(await fs.readFile(templatePath, "utf8"));
  config.project_dir = ".";
  config.rag_dir = "./.chilon-recall";
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: force ? "w" : "wx" });
  return configPath;
}

export async function installProject(directory, { force = false, setup = setupEngine } = {}) {
  if (!directory) {
    throw new Error("install requires a document directory.");
  }
  const engine = await setup();
  const configPath = await initializeConfig(directory, { force });
  return {
    config: configPath,
    engine,
    next: "Set RAG_MANAGER_CONFIG to this path and provide provider credentials only through environment variables."
  };
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function doctor() {
  const report = {
    version: await packageVersion(),
    runtime_home: runtimeHome(),
    node: process.version,
    bootstrap_python: { ready: false },
    engine: { ready: false, managed_python: venvPython() },
    configuration: { ready: false }
  };
  try {
    const bootstrap = await findBootstrapPython();
    report.bootstrap_python = {
      ready: true,
      command: bootstrap.command,
      version: `${bootstrap.version.major}.${bootstrap.version.minor}.${bootstrap.version.patch}`
    };
  } catch (error) {
    report.bootstrap_python.error = error.message;
  }

  try {
    const enginePython = await resolveEnginePython();
    if (!process.env.CHILON_RECALL_PYTHON && !(await fileExists(enginePython))) {
      throw new Error("Managed Python engine is missing.");
    }
    await runProcess(enginePython, ["-c", "import faiss, httpx, numpy, chilon_recall; print('ok')"]);
    report.engine = { ready: true, python: enginePython };
  } catch (error) {
    report.engine.error = error.message;
  }

  try {
    const config = await readConfig(resolveConfigPath());
    const embeddingCredentialAvailable = Boolean(process.env[config.data.embedding.api_key_env]);
    const rerankerCredentialAvailable = config.data.reranker.enabled
      ? Boolean(process.env[config.data.reranker.api_key_env || config.data.embedding.api_key_env])
      : true;
    report.configuration = {
      ready: true,
      path: config.configPath,
      embedding_credential_available: embeddingCredentialAvailable,
      reranker_credential_available: rerankerCredentialAvailable,
      credentials_ready: embeddingCredentialAvailable && rerankerCredentialAvailable
    };
  } catch (error) {
    report.configuration.error = error.message;
  }
  writeJson(report);
  return report.bootstrap_python.ready &&
    report.engine.ready &&
    report.configuration.ready &&
    report.configuration.credentials_ready
    ? 0
    : 1;
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "mcp";
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help);
    return 0;
  }
  if (["version", "--version", "-v"].includes(command)) {
    process.stdout.write(`${await packageVersion()}\n`);
    return 0;
  }
  if (command === "setup") {
    writeJson(await setupEngine());
    return 0;
  }
  if (command === "install") {
    const args = argv.slice(1);
    const force = args.includes("--force");
    const directory = args.find((arg) => arg !== "--force");
    if (args.filter((arg) => arg !== "--force").length > 1) {
      throw new Error("`install` accepts at most one document directory.");
    }
    writeJson(await installProject(directory, { force }));
    return 0;
  }
  if (command === "init") {
    const args = argv.slice(1);
    const force = args.includes("--force");
    const directory = args.find((arg) => arg !== "--force");
    if (args.filter((arg) => arg !== "--force").length > 1) {
      throw new Error("`init` accepts at most one document directory.");
    }
    if (!directory) {
      throw new Error("init requires a document directory.");
    }
    const configPath = await initializeConfig(directory, { force });
    writeJson({ config: configPath, next: "Set RAG_MANAGER_CONFIG to this path, then configure your provider environment variables." });
    return 0;
  }
  if (command === "qoder") {
    const args = argv.slice(1);
    const force = args.includes("--force");
    const positional = args.filter((arg) => arg !== "--force");
    if (positional.length > 1) {
      throw new Error("`qoder` accepts at most one project directory.");
    }
    writeJson(await installQoder(positional[0], { force }));
    return 0;
  }
  if (command === "doctor") return doctor();
  if (command === "mcp") {
    process.env.CHILON_RECALL_PYTHON = await resolveEnginePython();
    await startStdioServer();
    return 0;
  }
  throw new Error(`Unknown command: ${command}. Run \`chilon-recall --help\` for usage.`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`Chilon Recall CLI failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
