import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ConfirmationStore, fingerprint } from "../../src/confirmations.mjs";
import { assertSafePath } from "../../src/files.mjs";

test("confirmation tokens are single-use, state-bound, and expire", () => {
  let now = 1000;
  const store = new ConfirmationStore({ ttlMs: 100, now: () => now });
  const state = fingerprint({ files: ["a.md"] });
  const issued = store.issue("build", state);
  assert.throws(() => store.consume(issued.confirmationToken, "clear", state), /does not match/);

  const second = store.issue("build", state);
  store.consume(second.confirmationToken, "build", state);
  assert.throws(() => store.consume(second.confirmationToken, "build", state), /valid, unexpired/);

  const third = store.issue("build", state);
  now += 101;
  assert.throws(() => store.consume(third.confirmationToken, "build", state), /valid, unexpired/);
});

test("safe path validation rejects root, traversal, and symlink escape", async (context) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "chilon-path-"));
  const root = path.join(temp, "rag");
  const outside = path.join(temp, "outside");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  await assert.rejects(assertSafePath(root, root), /protected root/);
  await assert.rejects(assertSafePath(outside, root), /outside/);
  assert.equal(await assertSafePath(path.join(root, "faiss_db"), root), path.join(root, "faiss_db"));

  const link = path.join(root, "escape");
  try {
    await fs.symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    context.skip(`symlink creation is unavailable: ${error.message}`);
    return;
  }
  await assert.rejects(assertSafePath(path.join(link, "index"), root), /real parent escapes/);
});

