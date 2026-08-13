import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readConfig } from "../../src/config.mjs";
import { buildWithSwap, clearIndex, listBackups, restoreBackup } from "../../src/operations.mjs";

async function fixture() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-ops-"));
  const project = path.join(temp, "kb");
  const rag = path.join(project, ".chilon-recall");
  const configPath = path.join(temp, "config.json");
  await fs.mkdir(project);
  await fs.writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      project_dir: project,
      rag_dir: rag,
      file_extensions: [".md"],
      embedding: {
        adapter: "openai-compatible",
        base_url: "http://127.0.0.1:9999/v1",
        model: "mock",
        api_key_env: "RAG_API_KEY",
        doc_prefix: "",
        query_prefix: ""
      },
      reranker: { enabled: false, adapter: "cohere-compatible" },
      chunking: { max_chars: 400, overlap_chars: 50, min_chars: 20 },
      retrieval: { retrieve_top_k: 10, rerank_top_n: 3 },
      build: { batch_size: 4 },
      display: { expose_absolute_paths: false }
    })
  );
  return readConfig(configPath);
}

async function fakeBuild(_config, output, marker = "new") {
  await fs.writeFile(path.join(output, "index.faiss"), marker);
  await fs.writeFile(path.join(output, "meta.json"), "[]");
  await fs.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify({ vector_count: 1, indexed_files: 1 })
  );
  return { vector_count: 1, indexed_files: 1 };
}

test("failed staged builds leave the active index untouched", async () => {
  const config = await fixture();
  await fs.mkdir(config.indexDir, { recursive: true });
  await fs.writeFile(path.join(config.indexDir, "index.faiss"), "old");
  await fs.writeFile(path.join(config.indexDir, "meta.json"), "[]");
  await fs.writeFile(path.join(config.indexDir, "manifest.json"), "{}");
  await assert.rejects(
    buildWithSwap(config, async (_config, output) => {
      await fs.writeFile(path.join(output, "partial"), "broken");
      throw new Error("mock build failed");
    }),
    /mock build failed/
  );
  assert.equal(await fs.readFile(path.join(config.indexDir, "index.faiss"), "utf8"), "old");
});

test("build, clear, and restore preserve recoverable backups", async () => {
  const config = await fixture();
  await fs.mkdir(config.indexDir, { recursive: true });
  await fs.writeFile(path.join(config.indexDir, "index.faiss"), "old");
  await fs.writeFile(path.join(config.indexDir, "meta.json"), "[]");
  await fs.writeFile(path.join(config.indexDir, "manifest.json"), JSON.stringify({ vector_count: 1 }));

  const built = await buildWithSwap(config, fakeBuild);
  assert.equal(await fs.readFile(path.join(config.indexDir, "index.faiss"), "utf8"), "new");
  assert.ok(built.backup_id);
  const cleared = await clearIndex(config);
  assert.equal(cleared.cleared, true);
  assert.equal(await fs.stat(config.indexDir).catch(() => null), null);

  const backups = await listBackups(config);
  assert.ok(backups.length >= 2);
  await restoreBackup(config, cleared.backup_id);
  assert.equal(await fs.readFile(path.join(config.indexDir, "index.faiss"), "utf8"), "new");
});

