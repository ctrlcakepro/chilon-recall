import assert from "node:assert/strict";
import test from "node:test";

import { listProviderModels, recommendModels } from "../../src/models.mjs";
import { renderKeySetup } from "../../src/keyWizard.mjs";

test("listProviderModels normalizes the base URL and parses OpenAI-style model lists", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: [{ id: "BAAI/bge-m3" }, { id: "Qwen/Qwen3-Reranker-8B" }, { id: "BAAI/bge-m3" }]
      })
    };
  };

  const ids = await listProviderModels({
    baseUrl: "https://api.siliconflow.cn/v1/",
    apiKey: "sk-test",
    fetchImpl
  });

  assert.deepEqual(ids, ["BAAI/bge-m3", "Qwen/Qwen3-Reranker-8B"]);
  assert.equal(calls[0].url, "https://api.siliconflow.cn/v1/models");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
});

test("listProviderModels surfaces provider errors without leaking the key", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, statusText: "Unauthorized" });
  await assert.rejects(
    () => listProviderModels({ baseUrl: "https://api.example.com/v1", apiKey: "sk-secret", fetchImpl }),
    /401/
  );
});

test("recommendModels groups by embedding/rerank keyword hints", () => {
  const rec = recommendModels(["BAAI/bge-m3", "Qwen/Qwen3-Reranker-8B", "some-other-model"]);
  assert.equal(rec.suggestedEmbeddingModel, "BAAI/bge-m3");
  assert.equal(rec.suggestedRerankModel, "Qwen/Qwen3-Reranker-8B");
  assert.deepEqual(rec.other, ["some-other-model"]);
});

test("renderKeySetup never writes the key anywhere but the returned command text", () => {
  const setup = renderKeySetup({
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "sk-super-secret",
    envName: "RAG_API_KEY",
    rerankEnvName: "RAG_RERANK_API_KEY",
    modelIds: ["BAAI/bge-m3", "Qwen/Qwen3-Reranker-8B"]
  });

  assert.equal(setup.commands.powershell.thisWindowOnly, '$env:RAG_API_KEY = "sk-super-secret"');
  assert.equal(setup.commands.powershell.persistent, 'setx RAG_API_KEY "sk-super-secret"');
  assert.match(setup.commands.bash.thisShellOnly, /^export RAG_API_KEY="sk-super-secret"$/);
  assert.ok(setup.notes.some((note) => note.includes("never writes the key to a file")));
});
