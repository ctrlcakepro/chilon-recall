import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  applyConfigPatch,
  publicConfig,
  readConfig,
  resolveConfigPath,
  writeConfigAtomically
} from "./config.mjs";
import { ConfirmationStore, fingerprint } from "./confirmations.mjs";
import { buildIndex, queryIndex, syncIndex } from "./engine.mjs";
import { collectSourceFiles, pathExists, presentFile } from "./files.mjs";
import {
  buildWithSwap,
  clearIndex,
  listBackups,
  restoreBackup
} from "./operations.mjs";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

function textAndStructured(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
  };
}

function protectedHandler(handler) {
  return async (args) => {
    try {
      return await handler(args || {});
    } catch (error) {
      return toolError(error);
    }
  };
}

async function readManifest(config) {
  try {
    return JSON.parse(await fs.readFile(path.join(config.indexDir, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

async function operationState(config, extra = {}) {
  const files = await collectSourceFiles(config);
  let indexState = null;
  try {
    const stat = await fs.stat(config.indexDir);
    indexState = { modifiedMs: Math.trunc(stat.mtimeMs), manifest: await readManifest(config) };
  } catch {
    indexState = null;
  }
  return fingerprint({ config: config.raw, files, indexState, ...extra });
}

function publicTarget(config, target) {
  return config.data.display.expose_absolute_paths ? target : path.relative(config.projectDir, target);
}

function studyPacket(mode, task, question, retrieval, sections, notes) {
  return {
    mode,
    task,
    question,
    suggested_output_sections: sections,
    notes,
    evidence: retrieval.hits,
    evidence_count: retrieval.count
  };
}

export function createChilonRecallServer({ configPath = resolveConfigPath(), confirmations } = {}) {
  const confirmationStore = confirmations || new ConfirmationStore();
  const server = new McpServer(
    { name: "chilon-recall", version: "0.1.2" },
    {
      instructions:
        "Chilon Recall is a local, source-backed knowledge engine. Check rag_status before build or recovery work. Prefer read-only retrieval tools. rag_build, rag_clear_index, and rag_restore_index require a preview followed by a matching confirmation token; never bypass that sequence. Report source paths and evidence limits, and do not claim that retrieved text proves more than it contains."
    }
  );

  const load = () => readConfig(configPath);

  server.registerTool(
    "rag_status",
    {
      title: "Knowledge Base Status",
      description: "Inspect source coverage, provider readiness, and the active index without changing data.",
      inputSchema: {},
      annotations: readOnly
    },
    protectedHandler(async () => {
      const config = await load();
      const files = await collectSourceFiles(config);
      const manifest = await readManifest(config);
      return textAndStructured({
        config: publicConfig(config),
        source_file_count: files.length,
        source_bytes: files.reduce((sum, file) => sum + file.size, 0),
        index_ready: Boolean(manifest && (await pathExists(path.join(config.indexDir, "index.faiss")))),
        index: manifest,
        active_index: publicTarget(config, config.indexDir)
      });
    })
  );

  server.registerTool(
    "rag_list_documents",
    {
      title: "List Knowledge Sources",
      description: "List text documents included by the fixed knowledge-base configuration.",
      inputSchema: { limit: z.number().int().min(1).max(2_000).optional() },
      annotations: readOnly
    },
    protectedHandler(async ({ limit = 500 }) => {
      const config = await load();
      const files = await collectSourceFiles(config);
      return textAndStructured({
        count: files.length,
        returned: Math.min(limit, files.length),
        files: files
          .slice(0, limit)
          .map((file) => presentFile(file, config.data.display.expose_absolute_paths))
      });
    })
  );

  server.registerTool(
    "rag_save_config",
    {
      title: "Update Knowledge Configuration",
      description:
        "Atomically update approved non-secret settings in the server's fixed configuration file.",
      inputSchema: {
        projectDir: z.string().min(1).optional(),
        ragDir: z.string().min(1).optional(),
        fileExtensions: z.array(z.string()).min(1).optional(),
        embeddingBaseUrl: z.string().url().optional(),
        embeddingModel: z.string().min(1).optional(),
        embeddingApiKeyEnv: z.string().min(1).optional(),
        docPrefix: z.string().optional(),
        queryPrefix: z.string().optional(),
        rerankerEnabled: z.boolean().optional(),
        rerankerUrl: z.string().url().optional(),
        rerankerModel: z.string().min(1).optional(),
        rerankerApiKeyEnv: z.string().min(1).optional(),
        maxChars: z.number().int().min(100).max(20_000).optional(),
        overlapChars: z.number().int().min(0).max(5_000).optional(),
        minChars: z.number().int().min(1).max(1_000).optional(),
        batchSize: z.number().int().min(1).max(256).optional(),
        retrieveTopK: z.number().int().min(1).max(500).optional(),
        rerankTopN: z.number().int().min(1).max(100).optional(),
        exposeAbsolutePaths: z.boolean().optional()
      },
      annotations: writes
    },
    protectedHandler(async (patch) => {
      const config = await load();
      const next = applyConfigPatch(config.raw, patch);
      await writeConfigAtomically(config.configPath, next);
      const updated = await load();
      return textAndStructured({ saved: true, config: publicConfig(updated), backup_created: true });
    })
  );

  server.registerTool(
    "rag_build",
    {
      title: "Build Knowledge Index",
      description:
        "Preview or execute a staged index build. Execution requires the unexpired token returned by preview.",
      inputSchema: {
        action: z.enum(["preview", "execute"]).default("preview"),
        confirmationToken: z.string().optional()
      },
      annotations: destructive
    },
    protectedHandler(async ({ action = "preview", confirmationToken }) => {
      const config = await load();
      const files = await collectSourceFiles(config);
      const currentFingerprint = await operationState(config, { action: "build" });
      if (action === "preview") {
        const confirmation = confirmationStore.issue("build", currentFingerprint);
        return textAndStructured({
          action: "preview",
          source_file_count: files.length,
          source_bytes: files.reduce((sum, file) => sum + file.size, 0),
          replaces_existing_index: await pathExists(config.indexDir),
          target: publicTarget(config, config.indexDir),
          safety: "The new index is built in staging; the active index is backed up only after success.",
          ...confirmation
        });
      }
      confirmationStore.consume(confirmationToken, "build", currentFingerprint);
      return textAndStructured(await buildWithSwap(config, buildIndex));
    })
  );

  server.registerTool(
    "rag_sync",
    {
      title: "Synchronize Knowledge Index",
      description:
        "Preview or execute a staged content-hash sync. Unchanged files reuse existing vectors; added, modified, and deleted files are reconciled safely.",
      inputSchema: {
        action: z.enum(["preview", "execute"]).default("preview"),
        confirmationToken: z.string().optional()
      },
      annotations: destructive
    },
    protectedHandler(async ({ action = "preview", confirmationToken }) => {
      const config = await load();
      const files = await collectSourceFiles(config);
      const currentFingerprint = await operationState(config, { action: "sync" });
      if (action === "preview") {
        const confirmation = confirmationStore.issue("sync", currentFingerprint);
        return textAndStructured({
          action: "preview",
          source_file_count: files.length,
          source_bytes: files.reduce((sum, file) => sum + file.size, 0),
          replaces_existing_index: await pathExists(config.indexDir),
          target: publicTarget(config, config.indexDir),
          safety:
            "The synchronized index is built in staging. Unchanged vectors are reused only when the existing manifest and indexing settings are compatible; otherwise a full rebuild is used.",
          ...confirmation
        });
      }
      confirmationStore.consume(confirmationToken, "sync", currentFingerprint);
      return textAndStructured(await buildWithSwap(config, syncIndex));
    })
  );

  server.registerTool(
    "rag_query",
    {
      title: "Query Knowledge Index",
      description: "Retrieve source-backed passages from the active local index.",
      inputSchema: {
        question: z.string().min(1).max(10_000),
        top: z.number().int().min(1).max(100).optional(),
        candidates: z.number().int().min(1).max(500).optional()
      },
      annotations: readOnly
    },
    protectedHandler(async ({ question, top, candidates }) => {
      const config = await load();
      return textAndStructured(await queryIndex(config, question, { top, candidates }));
    })
  );

  server.registerTool(
    "rag_clear_index",
    {
      title: "Clear Active Index Safely",
      description:
        "Preview or move the active index into a recoverable backup. Execution requires a matching token.",
      inputSchema: {
        action: z.enum(["preview", "execute"]).default("preview"),
        confirmationToken: z.string().optional()
      },
      annotations: destructive
    },
    protectedHandler(async ({ action = "preview", confirmationToken }) => {
      const config = await load();
      const currentFingerprint = await operationState(config, { action: "clear" });
      if (action === "preview") {
        const confirmation = confirmationStore.issue("clear", currentFingerprint);
        return textAndStructured({
          action: "preview",
          index_exists: await pathExists(config.indexDir),
          target: publicTarget(config, config.indexDir),
          safety: "Execution moves the active index to backups; it does not permanently delete it.",
          ...confirmation
        });
      }
      confirmationStore.consume(confirmationToken, "clear", currentFingerprint);
      return textAndStructured(await clearIndex(config));
    })
  );

  server.registerTool(
    "rag_list_backups",
    {
      title: "List Index Backups",
      description: "List recoverable index backups without exposing their absolute paths.",
      inputSchema: {},
      annotations: readOnly
    },
    protectedHandler(async () => {
      const config = await load();
      const backups = await listBackups(config);
      return textAndStructured({ count: backups.length, backups });
    })
  );

  server.registerTool(
    "rag_restore_index",
    {
      title: "Restore Index Backup",
      description:
        "Preview or restore a named backup. Execution requires a matching token and backs up the current index first.",
      inputSchema: {
        backupId: z.string().regex(/^[A-Za-z0-9._-]+$/),
        action: z.enum(["preview", "execute"]).default("preview"),
        confirmationToken: z.string().optional()
      },
      annotations: destructive
    },
    protectedHandler(async ({ backupId, action = "preview", confirmationToken }) => {
      const config = await load();
      const backups = await listBackups(config);
      const selected = backups.find((backup) => backup.id === backupId);
      if (!selected) throw new Error(`Backup not found: ${backupId}`);
      const currentFingerprint = await operationState(config, { action: "restore", backup: selected });
      if (action === "preview") {
        const confirmation = confirmationStore.issue("restore", currentFingerprint);
        return textAndStructured({
          action: "preview",
          backup: selected,
          replaces_existing_index: await pathExists(config.indexDir),
          safety: "The current active index is backed up before the selected backup is restored.",
          ...confirmation
        });
      }
      confirmationStore.consume(confirmationToken, "restore", currentFingerprint);
      return textAndStructured(await restoreBackup(config, backupId));
    })
  );

  server.registerTool(
    "textbook_qa",
    {
      title: "Source-backed Learning Q&A",
      description: "Retrieve evidence for answering a learning question from the configured knowledge base.",
      inputSchema: {
        question: z.string().min(1).max(10_000),
        depth: z.enum(["brief", "standard", "detailed"]).default("standard"),
        top: z.number().int().min(1).max(100).optional(),
        candidates: z.number().int().min(1).max(500).optional()
      },
      annotations: readOnly
    },
    protectedHandler(async ({ question, depth = "standard", top, candidates }) => {
      const config = await load();
      const retrieval = await queryIndex(config, question, { top, candidates });
      return textAndStructured(
        studyPacket(
          "textbook_qa",
          `Answer the question at ${depth} depth using only supported source claims.`,
          question,
          retrieval,
          ["Direct answer", "Source evidence", "Explanation", "Evidence limits"],
          ["Separate source facts from explanation.", "State clearly when the evidence is incomplete."]
        )
      );
    })
  );

  server.registerTool(
    "concept_compare",
    {
      title: "Grounded Concept Comparison",
      description: "Retrieve evidence for comparing two concepts across clear dimensions.",
      inputSchema: {
        conceptA: z.string().min(1),
        conceptB: z.string().min(1),
        compareFocus: z.string().default("definitions, similarities, differences, relationships, and examples"),
        top: z.number().int().min(1).max(100).optional(),
        candidates: z.number().int().min(1).max(500).optional()
      },
      annotations: readOnly
    },
    protectedHandler(async ({ conceptA, conceptB, compareFocus, top, candidates }) => {
      const question = `Compare ${conceptA} and ${conceptB} across ${compareFocus}. Retrieve evidence for both concepts.`;
      const config = await load();
      const retrieval = await queryIndex(config, question, { top, candidates });
      return textAndStructured(
        studyPacket(
          "concept_compare",
          `Compare ${conceptA} and ${conceptB} without inventing unsupported distinctions.`,
          question,
          retrieval,
          ["Comparison table", "Similarities", "Differences", "Common confusions", "Sources"],
          ["If sources do not compare the concepts directly, synthesize each definition before comparing."]
        )
      );
    })
  );

  server.registerTool(
    "chapter_summary",
    {
      title: "Grounded Chapter Summary",
      description: "Retrieve evidence for a structured chapter or topic summary.",
      inputSchema: {
        chapterOrTopic: z.string().min(1),
        emphasis: z.string().default("core claims, key concepts, structure, methods, and examples"),
        top: z.number().int().min(1).max(100).optional(),
        candidates: z.number().int().min(1).max(500).optional()
      },
      annotations: readOnly
    },
    protectedHandler(async ({ chapterOrTopic, emphasis, top, candidates }) => {
      const question = `Summarize ${chapterOrTopic}, emphasizing ${emphasis}. Retrieve broad source coverage.`;
      const config = await load();
      const retrieval = await queryIndex(config, question, { top, candidates });
      return textAndStructured(
        studyPacket(
          "chapter_summary",
          `Create a source-grounded summary of ${chapterOrTopic}.`,
          question,
          retrieval,
          ["Scope", "Core ideas", "Key concepts", "Structure", "Review points", "Sources"],
          ["Name the covered source sections.", "Do not present retrieval coverage as chapter completeness."]
        )
      );
    })
  );

  server.registerTool(
    "review_outline",
    {
      title: "Evidence-backed Review Outline",
      description: "Retrieve evidence and organize it for focused study or review.",
      inputSchema: {
        topic: z.string().min(1),
        reviewMode: z.enum(["definitions", "short-answer", "essay", "comprehensive"]).default("comprehensive"),
        top: z.number().int().min(1).max(100).optional(),
        candidates: z.number().int().min(1).max(500).optional()
      },
      annotations: readOnly
    },
    protectedHandler(async ({ topic, reviewMode, top, candidates }) => {
      const question = `For ${topic}, retrieve the definitions, claims, relationships, methods, and examples most useful for ${reviewMode} review.`;
      const config = await load();
      const retrieval = await queryIndex(config, question, { top, candidates });
      return textAndStructured(
        studyPacket(
          "review_outline",
          `Create a ${reviewMode} review outline for ${topic}.`,
          question,
          retrieval,
          ["Core concepts", "Key claims", "Connections", "Confusions", "Practice prompts", "Sources"],
          ["Keep external study advice separate from source-backed content."]
        )
      );
    })
  );

  return server;
}

export async function startStdioServer(options = {}) {
  const server = createChilonRecallServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  startStdioServer().catch((error) => {
    process.stderr.write(`Chilon Recall failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });
}
