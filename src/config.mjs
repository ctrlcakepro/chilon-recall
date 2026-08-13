import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

const envName = z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "must be an environment variable name");
const safeUrl = z
  .string()
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password;
  }, "must not contain embedded credentials");

export const configSchema = z
  .object({
    version: z.literal(1),
    project_dir: z.string().min(1),
    rag_dir: z.string().min(1),
    file_extensions: z.array(z.string().regex(/^\.[A-Za-z0-9]+$/)).min(1),
    embedding: z
      .object({
        adapter: z.literal("openai-compatible"),
        base_url: safeUrl,
        model: z.string().min(1),
        api_key_env: envName,
        doc_prefix: z.string().default(""),
        query_prefix: z.string().default("")
      })
      .strict(),
    reranker: z
      .object({
        enabled: z.boolean().default(true),
        adapter: z.literal("cohere-compatible").default("cohere-compatible"),
        url: safeUrl.optional(),
        model: z.string().min(1).optional(),
        api_key_env: envName.optional()
      })
      .strict(),
    chunking: z
      .object({
        max_chars: z.number().int().min(100).max(20_000).default(800),
        overlap_chars: z.number().int().min(0).max(5_000).default(100),
        min_chars: z.number().int().min(1).max(1_000).default(40)
      })
      .strict(),
    retrieval: z
      .object({
        retrieve_top_k: z.number().int().min(1).max(500).default(20),
        rerank_top_n: z.number().int().min(1).max(100).default(5)
      })
      .strict(),
    build: z
      .object({
        batch_size: z.number().int().min(1).max(256).default(16)
      })
      .strict(),
    display: z
      .object({
        expose_absolute_paths: z.boolean().default(false)
      })
      .strict()
      .default({ expose_absolute_paths: false })
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.chunking.overlap_chars >= value.chunking.max_chars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunking", "overlap_chars"],
        message: "overlap_chars must be smaller than max_chars"
      });
    }
    if (value.retrieval.rerank_top_n > value.retrieval.retrieve_top_k) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["retrieval", "rerank_top_n"],
        message: "rerank_top_n must not exceed retrieve_top_k"
      });
    }
    if (value.reranker.enabled && (!value.reranker.url || !value.reranker.model)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reranker"],
        message: "enabled reranker requires url and model"
      });
    }
  });

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function resolveFrom(baseDir, value) {
  return path.resolve(baseDir, value);
}

export function isSubpath(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function resolveConfigPath(env = process.env) {
  const configured = env.RAG_MANAGER_CONFIG;
  if (!configured) {
    throw new Error(
      "RAG_MANAGER_CONFIG is required. Point it to a Chilon Recall JSON configuration file."
    );
  }
  return path.resolve(configured);
}

export async function readConfig(configPath = resolveConfigPath()) {
  const resolvedConfigPath = path.resolve(configPath);
  const rawText = await fs.readFile(resolvedConfigPath, "utf8");
  const raw = JSON.parse(stripBom(rawText));
  const data = configSchema.parse(raw);
  const baseDir = path.dirname(resolvedConfigPath);
  const projectDir = resolveFrom(baseDir, data.project_dir);
  const ragDir = resolveFrom(baseDir, data.rag_dir);

  if (!isSubpath(ragDir, projectDir)) {
    throw new Error("rag_dir must be a dedicated subdirectory inside project_dir.");
  }

  return {
    data,
    raw,
    configPath: resolvedConfigPath,
    configDir: baseDir,
    projectDir,
    ragDir,
    indexDir: path.join(ragDir, "faiss_db"),
    backupsDir: path.join(ragDir, "backups"),
    stagingDir: path.join(ragDir, ".staging")
  };
}

export function publicConfig(config) {
  const expose = config.data.display.expose_absolute_paths;
  return {
    version: config.data.version,
    project_dir: expose ? config.projectDir : "<hidden>",
    rag_dir: expose ? config.ragDir : "<hidden>",
    file_extensions: config.data.file_extensions,
    embedding: {
      adapter: config.data.embedding.adapter,
      base_url: config.data.embedding.base_url,
      model: config.data.embedding.model,
      api_key_env: config.data.embedding.api_key_env,
      credential_available: Boolean(process.env[config.data.embedding.api_key_env])
    },
    reranker: {
      enabled: config.data.reranker.enabled,
      adapter: config.data.reranker.adapter,
      url: config.data.reranker.url,
      model: config.data.reranker.model,
      api_key_env: config.data.reranker.api_key_env || config.data.embedding.api_key_env,
      credential_available: config.data.reranker.enabled
        ? Boolean(process.env[config.data.reranker.api_key_env || config.data.embedding.api_key_env])
        : true
    },
    chunking: config.data.chunking,
    retrieval: config.data.retrieval,
    build: config.data.build,
    display: config.data.display
  };
}

export function applyConfigPatch(raw, patch) {
  const next = structuredClone(raw);
  if (patch.projectDir !== undefined) next.project_dir = patch.projectDir;
  if (patch.ragDir !== undefined) next.rag_dir = patch.ragDir;
  if (patch.fileExtensions !== undefined) next.file_extensions = patch.fileExtensions;
  if (patch.embeddingBaseUrl !== undefined) next.embedding.base_url = patch.embeddingBaseUrl;
  if (patch.embeddingModel !== undefined) next.embedding.model = patch.embeddingModel;
  if (patch.embeddingApiKeyEnv !== undefined) next.embedding.api_key_env = patch.embeddingApiKeyEnv;
  if (patch.docPrefix !== undefined) next.embedding.doc_prefix = patch.docPrefix;
  if (patch.queryPrefix !== undefined) next.embedding.query_prefix = patch.queryPrefix;
  if (patch.rerankerEnabled !== undefined) next.reranker.enabled = patch.rerankerEnabled;
  if (patch.rerankerUrl !== undefined) next.reranker.url = patch.rerankerUrl;
  if (patch.rerankerModel !== undefined) next.reranker.model = patch.rerankerModel;
  if (patch.rerankerApiKeyEnv !== undefined) next.reranker.api_key_env = patch.rerankerApiKeyEnv;
  if (patch.maxChars !== undefined) next.chunking.max_chars = patch.maxChars;
  if (patch.overlapChars !== undefined) next.chunking.overlap_chars = patch.overlapChars;
  if (patch.minChars !== undefined) next.chunking.min_chars = patch.minChars;
  if (patch.batchSize !== undefined) next.build.batch_size = patch.batchSize;
  if (patch.retrieveTopK !== undefined) next.retrieval.retrieve_top_k = patch.retrieveTopK;
  if (patch.rerankTopN !== undefined) next.retrieval.rerank_top_n = patch.rerankTopN;
  if (patch.exposeAbsolutePaths !== undefined) next.display.expose_absolute_paths = patch.exposeAbsolutePaths;
  return configSchema.parse(next);
}

export async function writeConfigAtomically(configPath, payload) {
  configSchema.parse(payload);
  const directory = path.dirname(configPath);
  const tempPath = path.join(directory, `.${path.basename(configPath)}.${process.pid}.tmp`);
  const backupPath = `${configPath}.bak`;
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tempPath, serialized, { encoding: "utf8", flag: "wx" });
  try {
    try {
      await fs.copyFile(configPath, backupPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.rename(tempPath, configPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
  return backupPath;
}
