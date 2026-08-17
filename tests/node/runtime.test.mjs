import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeConfig } from "../../scripts/cli.mjs";
import { parsePythonVersion, runtimeHome, supportsPython, venvDir, venvPython } from "../../src/runtime.mjs";

test("runtime paths respect platform defaults and explicit overrides", () => {
  const windows = { env: { LOCALAPPDATA: "C:\\Local" }, platform: "win32", home: "C:\\Users\\Demo" };
  assert.equal(runtimeHome(windows), path.join("C:\\Local", "Chilon Recall"));
  assert.equal(venvDir(windows), path.join("C:\\Local", "Chilon Recall", "engine"));
  assert.equal(venvPython(windows), path.join("C:\\Local", "Chilon Recall", "engine", "Scripts", "python.exe"));

  const linux = { env: { XDG_DATA_HOME: "/var/data" }, platform: "linux", home: "/home/demo" };
  assert.equal(runtimeHome(linux), path.join("/var/data", "chilon-recall"));
  assert.equal(venvPython(linux), path.join("/var/data", "chilon-recall", "engine", "bin", "python"));

  const overridden = { env: { CHILON_RECALL_HOME: "/tmp/chilon" }, platform: "linux", home: "/home/demo" };
  assert.equal(runtimeHome(overridden), path.resolve("/tmp/chilon"));
});

test("Python version parser enforces the documented minimum", () => {
  assert.deepEqual(parsePythonVersion("Python 3.10.14"), { major: 3, minor: 10, patch: 14 });
  assert.equal(supportsPython(parsePythonVersion("Python 3.9.19")), false);
  assert.equal(supportsPython(parsePythonVersion("Python 3.10.0")), true);
  assert.equal(parsePythonVersion("not Python"), null);
});

test("init creates a local configuration without overwriting existing work", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-init-"));
  const configPath = await initializeConfig(directory);
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(config.project_dir, ".");
  assert.equal(config.rag_dir, "./.chilon-recall");
  await assert.rejects(initializeConfig(directory), /Configuration already exists/);
  await fs.rm(directory, { recursive: true, force: true });
});
