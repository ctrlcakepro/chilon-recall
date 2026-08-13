#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", ".scaffold", ".test-tmp", ".venv", "node_modules", "__pycache__"]);
const allowedBinary = new Set([".faiss", ".png", ".jpg", ".jpeg", ".gif", ".ico"]);
const rules = [
  { label: "Windows user path", pattern: /[A-Za-z]:\\Users\\[^\\\s]+/i },
  { label: "macOS user path", pattern: /\/Users\/[^/\s]+/ },
  { label: "likely API secret", pattern: /\b(?:sk|sf)-[A-Za-z0-9_-]{20,}\b/ },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "personal email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i }
];

async function files(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await files(target)));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

const failures = [];
for (const file of await files(root)) {
  if (allowedBinary.has(path.extname(file).toLowerCase())) continue;
  const content = await fs.readFile(file, "utf8");
  for (const rule of rules) {
    if (rule.pattern.test(content)) {
      failures.push(`${rule.label}: ${path.relative(root, file)}`);
    }
  }
}

if (failures.length) {
  process.stderr.write(`Publication check failed:\n${failures.map((item) => `- ${item}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Publication check passed: no personal paths, emails, or likely secrets found.\n");
