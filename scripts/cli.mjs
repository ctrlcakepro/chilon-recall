#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describeConfigError, readConfig, resolveConfigPath } from "../src/config.mjs";
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
import { renderKeySetup } from "../src/keyWizard.mjs";
import { listProviderModels } from "../src/models.mjs";
import { promptSecret } from "../src/secretPrompt.mjs";
import { startStdioServer } from "../src/server.mjs";

const help = `Chilon Recall — local-first MCP knowledge retrieval

Usage:
  chilon-recall install <directory> [--force]
                                      Create a private config and install the Python engine.
  chilon-recall init <directory> [--force]
                                      Create a private config in a document directory.
  chilon-recall qoder <directory> [--force]
                                      Generate the Qoder client surface (.qoder/mcp.json, skills, rules).
  chilon-recall key [--base-url <url>] [--env <NAME>]
                                      Paste a provider API key once (hidden input), see live model
                                      choices, and get copy-paste environment variable commands.
                                      The key is used for a single request and is never saved to disk.
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

export async function installProject(directory, { force = false, setup = setupEngine, onProgress, onOutput } = {}) {
  if (!directory) {
    throw new Error("install requires a document directory.");
  }
  const engine = await setup({ onProgress, onOutput });
  const configPath = await initializeConfig(directory, { force });
  return {
    config: configPath,
    engine,
    next: "Set RAG_MANAGER_CONFIG to this path and provide provider credentials only through environment variables."
  };
}

// `setup`/`install` print a single JSON result on stdout (scripts parse it), so
// engine-setup progress — otherwise up to a minute of total silence while pip
// installs faiss/numpy/httpx — goes to stderr instead, where it can't corrupt that
// JSON but still reaches an interactive terminal.
function cliProgress() {
  return {
    onProgress: (message) => process.stderr.write(`${message}\n`),
    onOutput: (chunk) => process.stderr.write(chunk)
  };
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const PLACEHOLDER_EMBEDDING_BASE_URL = "https://api.example.com/v1";
const PLACEHOLDER_EMBEDDING_MODEL = "your-embedding-model";

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
    const usesPlaceholderEndpoint = config.data.embedding.base_url === PLACEHOLDER_EMBEDDING_BASE_URL;
    const usesPlaceholderModel = config.data.embedding.model === PLACEHOLDER_EMBEDDING_MODEL;
    report.configuration = {
      ready: !usesPlaceholderEndpoint && !usesPlaceholderModel,
      path: config.configPath,
      embedding_credential_available: embeddingCredentialAvailable,
      reranker_credential_available: rerankerCredentialAvailable,
      credentials_ready: embeddingCredentialAvailable && rerankerCredentialAvailable && !usesPlaceholderEndpoint && !usesPlaceholderModel
    };
    if (usesPlaceholderEndpoint || usesPlaceholderModel) {
      report.configuration.error = `${config.configPath} still has the install template's placeholder embedding.${
        usesPlaceholderEndpoint ? "base_url" : "model"
      }. Edit it to your provider's real endpoint and model (or run \`chilon-recall key\` to find one) before building an index.`;
    }
  } catch (error) {
    report.configuration.error = describeConfigError(error);
  }
  writeJson(report);
  return report.bootstrap_python.ready &&
    report.engine.ready &&
    report.configuration.ready &&
    report.configuration.credentials_ready
    ? 0
    : 1;
}

function flagValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function keyWizard(args, { io = {} } = {}) {
  const prompt = io.promptSecret || promptSecret;
  const fetchModels = io.listProviderModels || listProviderModels;
  const write = io.write || ((text) => process.stdout.write(text));

  const envName = flagValue(args, "--env") || "RAG_API_KEY";
  let baseUrl = flagValue(args, "--base-url");
  if (!baseUrl) {
    try {
      const config = await readConfig(resolveConfigPath());
      baseUrl = config.data.embedding.base_url;
    } catch {
      // No usable config yet; --base-url is required below.
    }
  }
  if (!baseUrl) {
    throw new Error(
      "Pass --base-url <provider base URL> (e.g. https://api.siliconflow.cn/v1), or set RAG_MANAGER_CONFIG to a config that already has one."
    );
  }

  const apiKey = await prompt(`Paste your ${envName} for ${baseUrl} (input is hidden): `);
  if (!apiKey) {
    throw new Error("No API key entered.");
  }

  const modelIds = await fetchModels({ baseUrl, apiKey });
  const setup = renderKeySetup({ baseUrl, apiKey, envName, rerankEnvName: "RAG_RERANK_API_KEY", modelIds });
  const rec = setup.recommendation;

  write(`\nFound ${setup.modelCount} models at ${baseUrl}.\n`);
  write(
    rec.suggestedEmbeddingModel
      ? `Suggested embedding model: ${rec.suggestedEmbeddingModel}\n`
      : "No obvious embedding model found by name; check the provider's docs for the right one.\n"
  );
  if (rec.embedding.length > 1) {
    write(`Other embedding-looking models: ${rec.embedding.filter((id) => id !== rec.suggestedEmbeddingModel).slice(0, 5).join(", ")}\n`);
  }
  if (rec.suggestedRerankModel) {
    write(`Suggested reranker model: ${rec.suggestedRerankModel}\n`);
    if (rec.rerank.length > 1) {
      write(`Other rerank-looking models: ${rec.rerank.filter((id) => id !== rec.suggestedRerankModel).slice(0, 5).join(", ")}\n`);
    }
  }

  write(`\nRun ONE line below to make ${envName} available to chilon-recall:\n\n`);
  write(`  PowerShell, this window only:\n    ${setup.commands.powershell.thisWindowOnly}\n`);
  write(`  PowerShell, persists for new windows (run once):\n    ${setup.commands.powershell.persistent}\n\n`);
  write(`  bash/zsh, this shell only:\n    ${setup.commands.bash.thisShellOnly}\n`);
  write(`  bash/zsh, persists for new shells (run once):\n    ${setup.commands.bash.persistent}\n\n`);
  for (const note of setup.notes) {
    write(`Note: ${note}\n`);
  }
  write(`\nThen save the model choice with rag_save_config, or edit embedding.model / reranker.model in your chilon-recall.json.\n`);

  return setup;
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
    writeJson(await setupEngine(cliProgress()));
    return 0;
  }
  if (command === "install") {
    const args = argv.slice(1);
    const force = args.includes("--force");
    const directory = args.find((arg) => arg !== "--force");
    if (args.filter((arg) => arg !== "--force").length > 1) {
      throw new Error("`install` accepts at most one document directory.");
    }
    writeJson(await installProject(directory, { force, ...cliProgress() }));
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
  if (command === "key") {
    await keyWizard(argv.slice(1));
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
  main()
    .then((code) => {
      if (typeof code === "number") process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Chilon Recall CLI failed: ${describeConfigError(error)}\n`);
      process.exitCode = 1;
    });
}
