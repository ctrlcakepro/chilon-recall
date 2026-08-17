import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("package exposes a secret-free DeepSeek Harness MCP bundle", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const patchPath = path.join(root, "dsh", "cordis.patch.yml");
  const patch = await fs.readFile(patchPath, "utf8");

  assert.equal(manifest.dsh?.bundle?.patch, "./dsh/cordis.patch.yml");
  assert.ok(manifest.files.includes("dsh/cordis.patch.yml"));
  assert.match(patch, /name:\s*['"]@deepseek-ai\/dsh-mcp-client['"]/);
  assert.match(patch, /serverName:\s*chilon-recall/);
  assert.match(patch, /args:\s*\['scripts\/cli\.mjs', 'mcp'\]/);
  assert.match(patch, /RAG_MANAGER_CONFIG/);
  assert.match(patch, /RAG_API_KEY/);
  assert.doesNotMatch(patch, /\b(?:sk|sf)-[A-Za-z0-9_-]{20,}\b/);
});
