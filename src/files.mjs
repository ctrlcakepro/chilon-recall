import { promises as fs } from "node:fs";
import path from "node:path";

import { isSubpath } from "./config.mjs";

const ignoredDirectories = new Set([
  ".git",
  ".hg",
  ".svn",
  ".venv",
  "__pycache__",
  "node_modules"
]);

async function nearestExistingParent(target) {
  let current = path.resolve(target);
  while (true) {
    try {
      await fs.lstat(current);
      return current;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`No existing parent found for ${target}`);
      current = parent;
    }
  }
}

export async function assertSafePath(target, root, { allowRoot = false } = {}) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (!allowRoot && resolvedTarget === resolvedRoot) {
    throw new Error("Refusing to operate on the protected root directory.");
  }
  if (resolvedTarget !== resolvedRoot && !isSubpath(resolvedTarget, resolvedRoot)) {
    throw new Error("Refusing to operate outside the configured RAG directory.");
  }

  await fs.mkdir(resolvedRoot, { recursive: true });
  const realRoot = await fs.realpath(resolvedRoot);
  const existingParent = await nearestExistingParent(resolvedTarget);
  const realParent = await fs.realpath(existingParent);
  if (realParent !== realRoot && !isSubpath(realParent, realRoot)) {
    throw new Error("Refusing a path whose real parent escapes the configured RAG directory.");
  }
  return resolvedTarget;
}

export async function collectSourceFiles(config) {
  const extensions = new Set(config.data.file_extensions.map((item) => item.toLowerCase()));
  const results = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (fullPath === config.ragDir || isSubpath(fullPath, config.ragDir)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = await fs.stat(fullPath);
      results.push({
        absolute: fullPath,
        relative: path.relative(config.projectDir, fullPath),
        size: stat.size,
        modifiedMs: Math.trunc(stat.mtimeMs)
      });
    }
  }

  await walk(config.projectDir);
  results.sort((a, b) => a.relative.localeCompare(b.relative, "en"));
  return results;
}

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function presentFile(file, exposeAbsolutePaths) {
  const result = { path: file.relative, size: file.size };
  if (exposeAbsolutePaths) result.absolute_path = file.absolute;
  return result;
}
