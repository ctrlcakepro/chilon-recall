import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { promptSecret } from "../../src/secretPrompt.mjs";

// Simulates a raw-mode TTY stdin. Node delivers each keystroke as its own "data" event,
// but a paste is delivered as a single "data" event carrying the whole clipboard chunk
// (including any newlines it contains) — call emit() once per keystroke or once per paste
// to reproduce either shape.
function fakeTty() {
  const emitter = new EventEmitter();
  emitter.isTTY = true;
  emitter.setRawMode = () => {};
  emitter.resume = () => {};
  emitter.pause = () => {};
  emitter.setEncoding = () => {};
  return emitter;
}

function fakeOutput() {
  let written = "";
  return {
    write: (chunk) => {
      written += chunk;
      return true;
    },
    get written() {
      return written;
    }
  };
}

test("promptSecret resolves on character-by-character typing", async () => {
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  for (const char of "sk-test-key") input.emit("data", char);
  input.emit("data", "\n");
  assert.equal(await pending, "sk-test-key");
});

test("promptSecret resolves when a paste chunk carries a trailing newline", async () => {
  // Regression: a single "data" event of "sk-test-key\n" used to fall through every
  // case in the switch (none matched the whole multi-character string) into the
  // default branch, splicing the raw chunk (newline included) into value and never
  // resolving or rejecting — the wizard hung forever on the most common input path.
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  input.emit("data", "sk-test-key\n");
  assert.equal(await pending, "sk-test-key");
});

test("promptSecret resolves when a paste chunk has no trailing newline, then Enter is pressed", async () => {
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  input.emit("data", "sk-test-key");
  input.emit("data", "\n");
  assert.equal(await pending, "sk-test-key");
});

test("promptSecret submits at the first embedded newline in a multi-line paste", async () => {
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  input.emit("data", "sk-one\nsk-two");
  assert.equal(await pending, "sk-one");
});

test("promptSecret treats Ctrl-D (EOT) as submit", async () => {
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  input.emit("data", "sk-test-key");
  assert.equal(await pending, "sk-test-key");
});

test("promptSecret rejects on Ctrl-C", async () => {
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  input.emit("data", "sk-");
  await assert.rejects(() => pending, /Cancelled/);
});

test("promptSecret honors backspace within a pasted chunk", async () => {
  const input = fakeTty();
  const output = fakeOutput();
  const pending = promptSecret("Key: ", { input, output });
  input.emit("data", "sk-test-keyy\n");
  assert.equal(await pending, "sk-test-key");
});
