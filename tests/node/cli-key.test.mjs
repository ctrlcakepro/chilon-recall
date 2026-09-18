import assert from "node:assert/strict";
import test from "node:test";

import { keyWizard } from "../../scripts/cli.mjs";

test("keyWizard requires --base-url when no config is available", async () => {
  await assert.rejects(
    () => keyWizard([], { io: { promptSecret: async () => "sk-test" } }),
    /--base-url/
  );
});

test("keyWizard rejects an empty key without calling the provider", async () => {
  let fetched = false;
  await assert.rejects(
    () =>
      keyWizard(["--base-url", "https://api.example.com/v1"], {
        io: {
          promptSecret: async () => "",
          listProviderModels: async () => {
            fetched = true;
            return [];
          }
        }
      }),
    /No API key entered/
  );
  assert.equal(fetched, false);
});

test("keyWizard prints copy-paste commands and a model recommendation", async () => {
  const written = [];
  const result = await keyWizard(["--base-url", "https://api.siliconflow.cn/v1", "--env", "RAG_API_KEY"], {
    io: {
      promptSecret: async () => "sk-test-key",
      listProviderModels: async ({ baseUrl, apiKey }) => {
        assert.equal(baseUrl, "https://api.siliconflow.cn/v1");
        assert.equal(apiKey, "sk-test-key");
        return ["BAAI/bge-m3", "Qwen/Qwen3-Reranker-8B"];
      },
      write: (text) => written.push(text)
    }
  });

  assert.equal(result.recommendation.suggestedEmbeddingModel, "BAAI/bge-m3");
  assert.equal(result.recommendation.suggestedRerankModel, "Qwen/Qwen3-Reranker-8B");
  const output = written.join("");
  assert.match(output, /Suggested embedding model: BAAI\/bge-m3/);
  assert.match(output, /setx RAG_API_KEY "sk-test-key"/);
  assert.match(output, /export RAG_API_KEY="sk-test-key"/);
});
