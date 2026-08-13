import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyConfigPatch,
  configSchema,
  publicConfig,
  readConfig,
  writeConfigAtomically
} from "../../src/config.mjs";

function config(projectDir, ragDir) {
  return {
    version: 1,
    project_dir: projectDir,
    rag_dir: ragDir,
    file_extensions: [".md"],
    embedding: {
      adapter: "openai-compatible",
      base_url: "http://127.0.0.1:9999/v1",
      model: "mock-embedding",
      api_key_env: "RAG_API_KEY",
      doc_prefix: "",
      query_prefix: ""
    },
    reranker: { enabled: false, adapter: "cohere-compatible" },
    chunking: { max_chars: 400, overlap_chars: 50, min_chars: 20 },
    retrieval: { retrieve_top_k: 10, rerank_top_n: 3 },
    build: { batch_size: 4 },
    display: { expose_absolute_paths: false }
  };
}

test("configuration rejects secrets and invalid retrieval limits", () => {
  const valid = config("../kb", "../kb/.chilon-recall");
  assert.throws(() => configSchema.parse({ ...valid, api_key: "secret" }));
  assert.throws(() =>
    configSchema.parse({ ...valid, retrieval: { retrieve_top_k: 2, rerank_top_n: 3 } })
  );
  assert.throws(() =>
    configSchema.parse({
      ...valid,
      embedding: { ...valid.embedding, base_url: "https://user:password@127.0.0.1/v1" }
    })
  );
});

test("configuration is resolved, redacted, patched, and written atomically", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-config-"));
  const project = path.join(temp, "knowledge");
  const rag = path.join(project, ".chilon-recall");
  await fs.mkdir(project, { recursive: true });
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config(project, rag)), "utf8");

  const loaded = await readConfig(configPath);
  assert.equal(loaded.projectDir, project);
  assert.equal(publicConfig(loaded).project_dir, "<hidden>");
  const next = applyConfigPatch(loaded.raw, { maxChars: 900, embeddingModel: "next-model" });
  await writeConfigAtomically(configPath, next);
  assert.equal((await readConfig(configPath)).data.chunking.max_chars, 900);
  assert.equal((await readConfig(configPath)).data.embedding.model, "next-model");
  assert.equal(await fs.readFile(`${configPath}.bak`, "utf8"), JSON.stringify(config(project, rag)));
});

test("rag_dir must remain inside project_dir", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-boundary-"));
  const project = path.join(temp, "knowledge");
  await fs.mkdir(project);
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config(project, path.join(temp, "outside"))), "utf8");
  await assert.rejects(readConfig(configPath), /rag_dir must be/);
});
