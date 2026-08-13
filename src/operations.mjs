import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { assertSafePath, pathExists } from "./files.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function directorySize(directory) {
  let total = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(target);
    else if (entry.isFile()) total += (await fs.stat(target)).size;
  }
  return total;
}

export async function ensureStorage(config) {
  await fs.mkdir(config.ragDir, { recursive: true });
  await fs.mkdir(config.backupsDir, { recursive: true });
  await fs.mkdir(config.stagingDir, { recursive: true });
  await assertSafePath(config.indexDir, config.ragDir);
  await assertSafePath(config.backupsDir, config.ragDir);
  await assertSafePath(config.stagingDir, config.ragDir);
}

async function writeBackupMetadata(backupDir, kind) {
  const metadata = {
    id: path.basename(backupDir),
    kind,
    created_at: new Date().toISOString()
  };
  await fs.writeFile(path.join(backupDir, "backup.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

async function moveActiveToBackup(config, kind) {
  if (!(await pathExists(config.indexDir))) return null;
  const backupId = `${timestampId()}-${kind}-${crypto.randomBytes(4).toString("hex")}`;
  const backupDir = path.join(config.backupsDir, backupId);
  await assertSafePath(backupDir, config.ragDir);
  await fs.rename(config.indexDir, backupDir);
  const metadata = await writeBackupMetadata(backupDir, kind);
  return { ...metadata, path: backupDir };
}

export async function buildWithSwap(config, engineBuild) {
  await ensureStorage(config);
  const staging = path.join(config.stagingDir, `build-${crypto.randomUUID()}`);
  await assertSafePath(staging, config.ragDir);
  await fs.mkdir(staging, { recursive: false });
  let backup = null;
  try {
    const buildResult = await engineBuild(config, staging);
    for (const required of ["index.faiss", "meta.json", "manifest.json"]) {
      if (!(await pathExists(path.join(staging, required)))) {
        throw new Error(`Build did not produce required file: ${required}`);
      }
    }
    backup = await moveActiveToBackup(config, "pre-build");
    try {
      await fs.rename(staging, config.indexDir);
    } catch (error) {
      if (backup && !(await pathExists(config.indexDir))) {
        await fs.rename(backup.path, config.indexDir);
      }
      throw error;
    }
    return {
      built: true,
      backup_id: backup?.id || null,
      ...buildResult
    };
  } finally {
    if (await pathExists(staging)) {
      await assertSafePath(staging, config.stagingDir);
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}

export async function clearIndex(config) {
  await ensureStorage(config);
  const backup = await moveActiveToBackup(config, "clear");
  return {
    cleared: Boolean(backup),
    backup_id: backup?.id || null
  };
}

export async function listBackups(config) {
  await ensureStorage(config);
  const entries = await fs.readdir(config.backupsDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const backupDir = path.join(config.backupsDir, entry.name);
    await assertSafePath(backupDir, config.ragDir);
    let metadata = { id: entry.name, kind: "unknown", created_at: null };
    try {
      metadata = JSON.parse(await fs.readFile(path.join(backupDir, "backup.json"), "utf8"));
    } catch {
      // Older/manual backups remain visible with conservative metadata.
    }
    let manifest = null;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(backupDir, "manifest.json"), "utf8"));
    } catch {
      // A cleared legacy index may not include a manifest.
    }
    backups.push({
      id: entry.name,
      kind: metadata.kind,
      created_at: metadata.created_at,
      size_bytes: await directorySize(backupDir),
      vector_count: manifest?.vector_count ?? null,
      indexed_files: manifest?.indexed_files ?? null
    });
  }
  backups.sort((a, b) => b.id.localeCompare(a.id));
  return backups;
}

export async function restoreBackup(config, backupId) {
  if (!/^[A-Za-z0-9._-]+$/.test(backupId)) throw new Error("Invalid backup id.");
  await ensureStorage(config);
  const source = path.join(config.backupsDir, backupId);
  await assertSafePath(source, config.ragDir);
  if (!(await pathExists(source))) throw new Error(`Backup not found: ${backupId}`);

  const staging = path.join(config.stagingDir, `restore-${crypto.randomUUID()}`);
  await assertSafePath(staging, config.ragDir);
  await fs.cp(source, staging, {
    recursive: true,
    filter: (item) => path.basename(item) !== "backup.json"
  });
  const backup = await moveActiveToBackup(config, "pre-restore");
  try {
    await fs.rename(staging, config.indexDir);
  } catch (error) {
    if (backup && !(await pathExists(config.indexDir))) {
      await fs.rename(backup.path, config.indexDir);
    }
    throw error;
  }
  return { restored: true, restored_backup_id: backupId, previous_index_backup_id: backup?.id || null };
}
