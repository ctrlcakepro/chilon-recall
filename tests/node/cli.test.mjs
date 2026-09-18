import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { main } from "../../scripts/cli.mjs";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/cli.mjs");

async function withCapturedStdout(fn) {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(chunk.toString());
    return true;
  };
  try {
    const result = await fn();
    return { result, output: chunks.join("") };
  } finally {
    process.stdout.write = original;
  }
}

async function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("doctor treats install-template placeholder embedding.base_url/model as not ready", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-doctor-"));
  const configPath = path.join(directory, "chilon-recall.json");
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        version: 1,
        project_dir: ".",
        rag_dir: "./.chilon-recall",
        file_extensions: [".md"],
        embedding: {
          adapter: "openai-compatible",
          base_url: "https://api.example.com/v1",
          model: "your-embedding-model",
          api_key_env: "CHILON_RECALL_TEST_PLACEHOLDER_KEY"
        },
        reranker: { enabled: false, adapter: "cohere-compatible" },
        chunking: { max_chars: 800, overlap_chars: 100, min_chars: 40 },
        retrieval: { retrieve_top_k: 20, rerank_top_n: 5 },
        build: { batch_size: 16 }
      },
      null,
      2
    )
  );

  try {
    await withEnv(
      { RAG_MANAGER_CONFIG: configPath, CHILON_RECALL_TEST_PLACEHOLDER_KEY: "sk-real-key" },
      async () => {
        const { output } = await withCapturedStdout(() => main(["doctor"]));
        const report = JSON.parse(output);
        assert.equal(report.configuration.ready, false);
        assert.equal(report.configuration.embedding_credential_available, true);
        assert.equal(report.configuration.credentials_ready, false);
        assert.match(report.configuration.error, /placeholder/);
        assert.match(report.configuration.error, /base_url/);
      }
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("doctor reports configuration ready once the placeholder values are replaced", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-doctor-"));
  const configPath = path.join(directory, "chilon-recall.json");
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        version: 1,
        project_dir: ".",
        rag_dir: "./.chilon-recall",
        file_extensions: [".md"],
        embedding: {
          adapter: "openai-compatible",
          base_url: "https://api.siliconflow.cn/v1",
          model: "BAAI/bge-m3",
          api_key_env: "CHILON_RECALL_TEST_PLACEHOLDER_KEY"
        },
        reranker: { enabled: false, adapter: "cohere-compatible" },
        chunking: { max_chars: 800, overlap_chars: 100, min_chars: 40 },
        retrieval: { retrieve_top_k: 20, rerank_top_n: 5 },
        build: { batch_size: 16 }
      },
      null,
      2
    )
  );

  try {
    await withEnv(
      { RAG_MANAGER_CONFIG: configPath, CHILON_RECALL_TEST_PLACEHOLDER_KEY: "sk-real-key" },
      async () => {
        const { output } = await withCapturedStdout(() => main(["doctor"]));
        const report = JSON.parse(output);
        assert.equal(report.configuration.ready, true);
        assert.equal(report.configuration.credentials_ready, true);
        assert.equal(report.configuration.error, undefined);
      }
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI exit code reflects an unknown command as failure", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "not-a-real-command"]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Unknown command/);
      return true;
    }
  );
});

test("CLI exit code reflects a recognized command as success", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, "help"]);
  assert.equal(stderr, "");
  assert.match(stdout, /Chilon Recall/);
});
