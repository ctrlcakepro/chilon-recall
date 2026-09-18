import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { installQoder, qoderMcpConfig, QODER_SERVER_NAME } from "../../src/qoder.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function temporaryDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), "chilon-qoder-"));
}

test("renders a stdio server entry Qoder can load", () => {
  const config = qoderMcpConfig({ node: "node", root: "/opt/chilon-recall" });
  const server = config.mcpServers[QODER_SERVER_NAME];

  assert.equal(server.command, "node");
  assert.deepEqual(server.args, [path.join("/opt/chilon-recall", "scripts", "cli.mjs"), "mcp"]);
  assert.match(server.env.RAG_MANAGER_CONFIG, /^<absolute path/);
  assert.equal(Object.keys(server.env).length, 1);
});

test("installs skills and rules without writing credentials", async () => {
  const directory = await temporaryDirectory();
  try {
    const result = await installQoder(directory, { node: "node" });
    const bundled = (await fs.readdir(path.join(root, "skills"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const installed = (await fs.readdir(path.join(directory, ".qoder", "skills"))).sort();

    assert.deepEqual(installed, bundled);
    for (const name of bundled) {
      const source = await fs.readFile(path.join(root, "skills", name, "SKILL.md"), "utf8");
      const copied = await fs.readFile(path.join(directory, ".qoder", "skills", name, "SKILL.md"), "utf8");
      assert.equal(copied, source);
    }

    const rule = await fs.readFile(path.join(directory, ".qoder", "rules", "chilon-recall.md"), "utf8");
    assert.match(rule, /rag_status/);

    for (const file of result.written) {
      const content = await fs.readFile(file, "utf8");
      assert.doesNotMatch(content, /\b(?:sk|sf)-[A-Za-z0-9_-]{20,}\b/);
    }
    assert.ok(result.written.length >= bundled.length + 2);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("refuses to overwrite generated files without --force", async () => {
  const directory = await temporaryDirectory();
  try {
    await installQoder(directory, { node: "node" });
    await assert.rejects(() => installQoder(directory, { node: "node" }), /already exists/);
    await installQoder(directory, { node: "node", force: true });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
