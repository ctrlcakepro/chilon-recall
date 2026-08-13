import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("stdio MCP discovers tools and invokes rag_status", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-mcp-"));
  const project = path.join(temp, "knowledge");
  const rag = path.join(project, ".chilon-recall");
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, "source.md"), "# Demo\n\nSynthetic source content for MCP discovery.");
  const provider = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (request.url !== "/v1/embeddings") {
        response.writeHead(404).end();
        return;
      }
      const payload = JSON.parse(body);
      const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
      const data = inputs.map((text, index) => {
        const lower = text.toLowerCase();
        const raw = [lower.includes("synthetic") ? 4 : 1, lower.includes("source") ? 3 : 1, 1, 1];
        const norm = Math.sqrt(raw.reduce((sum, item) => sum + item * item, 0));
        return { index, embedding: raw.map((item) => item / norm) };
      });
      const encoded = JSON.stringify({ data });
      response.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(encoded) });
      response.end(encoded);
    });
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address();
  const configPath = path.join(temp, "config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      project_dir: project,
      rag_dir: rag,
      file_extensions: [".md"],
      embedding: {
        adapter: "openai-compatible",
        base_url: `http://127.0.0.1:${address.port}/v1`,
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

  const env = Object.fromEntries(
    Object.entries({
      ...process.env,
      RAG_MANAGER_CONFIG: configPath,
      RAG_API_KEY: "mock-key",
      CHILON_RECALL_PYTHON: "python"
    }).filter(
      ([, value]) => typeof value === "string"
    )
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("scripts/server.mjs")],
    cwd: path.resolve("."),
    env,
    stderr: "pipe"
  });
  const client = new Client({ name: "chilon-recall-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    for (const required of [
      "rag_status",
      "rag_query",
      "rag_build",
      "rag_clear_index",
      "rag_list_backups",
      "rag_restore_index",
      "textbook_qa",
      "concept_compare",
      "chapter_summary",
      "review_outline"
    ]) {
      assert.ok(names.includes(required), `${required} should be discoverable`);
    }
    const result = await client.callTool({ name: "rag_status", arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.source_file_count, 1);
    assert.equal(result.structuredContent.config.project_dir, "<hidden>");

    const preview = await client.callTool({ name: "rag_build", arguments: { action: "preview" } });
    assert.equal(preview.structuredContent.action, "preview");
    const built = await client.callTool({
      name: "rag_build",
      arguments: {
        action: "execute",
        confirmationToken: preview.structuredContent.confirmationToken
      }
    });
    assert.equal(built.structuredContent.built, true);
    assert.ok(built.structuredContent.vector_count > 0);

    const query = await client.callTool({
      name: "rag_query",
      arguments: { question: "What does the synthetic source contain?" }
    });
    assert.equal(query.structuredContent.count, 1);
    assert.equal(query.structuredContent.hits[0].file, "source.md");
  } finally {
    await client.close();
    await new Promise((resolve) => provider.close(resolve));
  }
});
