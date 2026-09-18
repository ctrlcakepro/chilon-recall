// Qoder IDE compatibility layer.
//
// Qoder reads MCP servers from its own IDE settings (Settings -> MCP), and reads
// project-level skills from `.qoder/skills/<name>/SKILL.md` and project rules from
// `.qoder/rules/`. This module renders those artifacts for a target project from the
// same stdio server and skill definitions the other clients use, so the retrieval
// engine is never duplicated and credentials are never written into shared files.

import { promises as fs } from "node:fs";
import path from "node:path";

import { packageRoot } from "./runtime.mjs";

export const QODER_SERVER_NAME = "chilon-recall";

// Only names are listed here. Values stay in the operating system environment.
export const QODER_ENV_VARS = [
  "RAG_MANAGER_CONFIG",
  "RAG_API_KEY",
  "RAG_RERANK_API_KEY",
  "CHILON_RECALL_HOME",
  "CHILON_RECALL_PYTHON"
];

const RULE_FILE = "chilon-recall.md";

const RULE_BODY = `# Chilon Recall retrieval rules

Apply when a request depends on the local Chilon Recall knowledge base.

1. Call \`rag_status\` before answering from sources when index readiness or source scope is unknown.
2. Use \`textbook_qa\`, \`concept_compare\`, \`chapter_summary\`, or \`review_outline\` instead of answering
   document questions from general knowledge.
3. Cite the relative source paths and headings returned by the tools.
4. Keep retrieved source claims separate from your own explanation or outside knowledge.
5. State what the evidence does not establish. A high retrieval score is not proof of completeness.
6. To refresh the index after documents change, call \`rag_sync\`, which reuses vectors for unchanged
   files. Use \`rag_build\` only for a deliberate full rebuild.
7. \`rag_build\`, \`rag_sync\`, \`rag_clear_index\`, and \`rag_restore_index\` require \`action: "preview"\` first.
   Show the preview to the user, then pass its token once with \`action: "execute"\`.
8. Never pass API keys as tool arguments. Credentials come from the environment only.
`;

/**
 * Render the MCP server entry to paste into Qoder IDE Settings -> MCP.
 * `env` carries placeholders only; real secrets belong in the OS environment.
 */
export function qoderMcpConfig({ node = process.execPath, root = packageRoot } = {}) {
  return {
    mcpServers: {
      [QODER_SERVER_NAME]: {
        command: node,
        args: [path.join(root, "scripts", "cli.mjs"), "mcp"],
        env: {
          RAG_MANAGER_CONFIG: "<absolute path to your private chilon-recall.json>"
        }
      }
    }
  };
}

async function skillNames(root) {
  const directory = path.join(root, "skills");
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(directory, entry.name, "SKILL.md"));
      names.push(entry.name);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return names.sort();
}

async function writeFile(target, content, force) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, { encoding: "utf8", flag: force ? "w" : "wx" });
  return target;
}

/**
 * Install the Qoder project surface into `directory`:
 * `.qoder/mcp.json`, `.qoder/skills/<name>/SKILL.md`, and `.qoder/rules/chilon-recall.md`.
 */
export async function installQoder(directory, { force = false, root = packageRoot, node = process.execPath } = {}) {
  const targetDirectory = path.resolve(directory || process.cwd());
  const qoderDirectory = path.join(targetDirectory, ".qoder");
  const written = [];

  try {
    written.push(
      await writeFile(
        path.join(qoderDirectory, "mcp.json"),
        `${JSON.stringify(qoderMcpConfig({ node, root }), null, 2)}\n`,
        force
      )
    );

    const names = await skillNames(root);
    for (const name of names) {
      const content = await fs.readFile(path.join(root, "skills", name, "SKILL.md"), "utf8");
      written.push(await writeFile(path.join(qoderDirectory, "skills", name, "SKILL.md"), content, force));
    }

    written.push(await writeFile(path.join(qoderDirectory, "rules", RULE_FILE), RULE_BODY, force));
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(
        `${error.path} already exists. Re-run with --force only if you intend to replace the generated Qoder files.`
      );
    }
    throw error;
  }

  return {
    directory: qoderDirectory,
    written,
    mcp_server: QODER_SERVER_NAME,
    forwarded_env: QODER_ENV_VARS,
    next: [
      "Open Qoder IDE Settings -> MCP -> My Servers -> + Add and paste .qoder/mcp.json, replacing the RAG_MANAGER_CONFIG placeholder.",
      "Provide RAG_API_KEY (and RAG_RERANK_API_KEY when reranking is enabled) through the environment Qoder inherits; never commit them.",
      "Restart Qoder IDE so the generated skills and rules are loaded."
    ]
  };
}
