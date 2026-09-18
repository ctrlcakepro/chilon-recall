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

test("listProviderModels does not double-append /models when baseUrl already ends with it", async () => {
  // Regression: a baseUrl copied from provider docs that already points at the full
  // "/models" endpoint used to become ".../v1/models/models".
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ data: [] }) };
  };

  await listProviderModels({ baseUrl: "https://api.example.com/v1/models/", apiKey: "sk-test", fetchImpl });
  assert.equal(calls[0].url, "https://api.example.com/v1/models");
});

test("listProviderModels surfaces provider errors without leaking the key", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, statusText: "Unauthorized" });
  await assert.rejects(
    () => listProviderModels({ baseUrl: "https://api.example.com/v1", apiKey: "sk-secret", fetchImpl }),
    /401/
  );
});

test("listProviderModels rejects a key with an embedded newline before ever calling fetch, and never echoes it", async () => {
  // Regression: a key with a raw newline (e.g. from a corrupted paste) made the
  // runtime's Headers implementation throw "Headers.append: \"Bearer sk-one\\nsk-two\"
  // is an invalid header value.", and that raw error.message — key included — was
  // wrapped straight into the thrown "Could not reach ..." error. That both leaked
  // the plaintext key (models.mjs promises it is "never ... logged, or echoed back")
  // and mislabeled a malformed-credential problem as a network failure.
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new TypeError('Headers.append: "Bearer sk-one\nsk-two" is an invalid header value.');
  };

  await assert.rejects(
    () => listProviderModels({ baseUrl: "https://api.example.com/v1", apiKey: "sk-one\nsk-two", fetchImpl }),
    (error) => {
      assert.doesNotMatch(error.message, /sk-one/);
      assert.doesNotMatch(error.message, /sk-two/);
      assert.doesNotMatch(error.message, /Could not reach/);
      return true;
    }
  );
  assert.equal(called, false, "fetch must not be attempted with a header-unsafe key");
});

test("listProviderModels redacts the key from an error message even if it leaks through fetch itself", async () => {
  const fetchImpl = async () => {
    throw new Error('Simulated leak: header value "Bearer sk-weird-key" was rejected');
  };

  await assert.rejects(
    () => listProviderModels({ baseUrl: "https://api.example.com/v1", apiKey: "sk-weird-key", fetchImpl }),
    (error) => {
      assert.doesNotMatch(error.message, /sk-weird-key/);
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    }
  );
});

test("recommendModels groups by embedding/rerank keyword hints", () => {
  const rec = recommendModels(["BAAI/bge-m3", "Qwen/Qwen3-Reranker-8B", "some-other-model"]);
  assert.equal(rec.suggestedEmbeddingModel, "BAAI/bge-m3");
  assert.equal(rec.suggestedRerankModel, "Qwen/Qwen3-Reranker-8B");
  assert.deepEqual(rec.other, ["some-other-model"]);
});

test("recommendModels does not suggest a reranker as the embedding model when names overlap", () => {
  // "bge-reranker-large" matches both the /bge/i embedding hint and the /rerank/i
  // rerank hint; it must land only in the rerank bucket.
  const rec = recommendModels(["bge-reranker-large", "zhihu-pinxi-gte-large"]);
  assert.deepEqual(rec.embedding, ["zhihu-pinxi-gte-large"]);
  assert.deepEqual(rec.rerank, ["bge-reranker-large"]);
  assert.equal(rec.suggestedEmbeddingModel, "zhihu-pinxi-gte-large");
  assert.equal(rec.suggestedRerankModel, "bge-reranker-large");
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

test("renderKeySetup warns that the persistent commands themselves write the plaintext key to disk/registry", () => {
  // The program not writing the key to a file doesn't mean the user won't: the
  // "persists" commands it hands out (setx / >> ~/.bashrc) do exactly that if run,
  // and also land in shell history and terminal scrollback. The notes must say so
  // rather than leaving the earlier "never writes ... to a file" claim to imply
  // those commands are equally hands-off.
  const setup = renderKeySetup({
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "sk-super-secret",
    envName: "RAG_API_KEY",
    rerankEnvName: "RAG_API_KEY",
    modelIds: ["BAAI/bge-m3"]
  });

  const persistenceWarning = setup.notes.find((note) => note.includes("setx") && note.includes("registry"));
  assert.ok(persistenceWarning, "expected a note explaining setx/~/.bashrc persist the key themselves");
  assert.match(persistenceWarning, /bashrc/);
  assert.match(persistenceWarning, /shell history|scrollback/);
});
