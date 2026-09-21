# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.5] - 2026-09-21

- Add `AGENTS_INSTALL.md` / `AGENTS_INSTALL.zh-CN.md`: a runbook an AI coding agent can follow to install and configure chilon-recall end to end. The API key step is deliberately left to the human — the agent is instructed to hand it back rather than pipe the key through its own shell or context. Both READMEs link to it from Quick start.
- Fix `AGENTS_INSTALL.md`/`.zh-CN.md` never telling the agent to set `RAG_MANAGER_CONFIG`, found by dry-running the runbook end to end: `doctor`, `key`, and the MCP server all require it with no default, so a literal first-time follow of the original text failed at the `doctor` check. The agent now persists it itself right after `install` (it isn't a secret), and the Claude Desktop snippet writes it straight into that client's `env` block instead of relying on environment inheritance.
- Known issue, unresolved: on 2026-09-18, `npx -y chilon-recall@0.1.4 <command>` — including `--help` and with no subcommand at all — failed on Windows with `'chilon-recall' is not recognized as an internal or external command`, while the identical package contents ran correctly via a direct `node scripts/cli.mjs` invocation or by calling the installed `.bin` shim directly. `npm cache verify` and a `--prefer-online` forced re-fetch ruled out a corrupted local cache; `package.json`'s `bin`/`scripts`/`engines`/`dependencies` and the resolved `node_modules/.bin` shims were byte-identical to the working 0.1.3 install. On 2026-09-21 the failure no longer reproduced on the same machine (Node 26.3, npm 11.16): `npx -y chilon-recall@0.1.4 --help`, `doctor`, and `@latest --version` all ran normally, with no change to the package or to the registry in between. The cause is still unknown, so the failure may recur. This release contains no fix for it, and whether 0.1.5 works via `npx` says nothing about the cause. If you hit it, run `node <install-dir>/scripts/cli.mjs` or `npm install -g chilon-recall` as a workaround, and please open an issue with the npm debug log and the contents of the matching `npm-cache/_npx/<hash>/node_modules/.bin` directory before clearing the cache.

## [0.1.4] - 2026-09-18

- Add `chilon-recall key`: a hidden-input prompt for a provider API key that calls the provider's own `/models` endpoint, suggests an embedding and reranker model, and prints ready-to-run `$env:`/`setx`/`export` commands. The key is used for a single request and is never written to disk.
- Fix `doctor` reporting `configuration.ready`/`credentials_ready: true` while `embedding.base_url`/`model` were still the install template's placeholder values.
- Fix the CLI entrypoint always exiting `0`: `main()`'s return value (notably `doctor`'s pass/fail code) was never applied to `process.exitCode`, so scripted checks against the exit code always saw success.
- Warn when `chilon-recall qoder` is run from an `npx` temporary cache: the generated `.qoder/mcp.json` embeds that ephemeral path, which breaks silently on the next cache clear or version bump.
- Fix `chilon-recall key` hanging forever when the pasted key contained a newline: raw-mode stdin delivers a paste as one multi-character chunk, which was treated as a single unknown keystroke. Input is now processed per character, so a multi-line paste submits at its first line break and the rest is discarded.
- Fix a header-unsafe key (for example one with an embedded newline) leaking in plaintext inside the error message and being misreported as a network failure. The key is now validated before any request, and redacted from any error that still surfaces.
- Fix model recommendation suggesting a reranker (e.g. a `bge-reranker-*` model) as the embedding model; rerank matches are excluded from the embedding candidates first.
- Fix a `base_url` that already ends with the endpoint suffix (e.g. `.../embeddings`) getting the suffix appended twice, in both the Python engine and the `key` model lookup.
- Configuration validation errors (a typo'd key, a wrong type) are now reported as a readable sentence in MCP tool errors and `doctor`, instead of a raw JSON dump of the validation issues.
- The first-run engine setup (virtual environment + `pip install`) now reports its progress and the underlying process output on stderr instead of running silently for up to a minute; stdout still carries only the single JSON result.
- Document that the `key` wizard's `setx` / `>> ~/.bashrc` commands store the key in plaintext (registry / shell profile) if run, and that all printed commands remain in shell history and scrollback.

## [0.1.3] - 2026-09-18

- Add `rag_sync`: a staged, content-hash incremental synchronization of the knowledge index. Unchanged files reuse their existing vectors; added, modified, and deleted files are reconciled.
- Record a version 2 index manifest with per-file SHA-256 source hashes and the indexing settings the vectors were produced under.
- Fall back to a full rebuild when indexing settings change, when an older manifest lacks the hashes, or when existing metadata is not covered by its manifest.
- Keep `rag_build` as the deliberate full-rebuild entry point; both paths use the same preview/execute confirmation and staged index swap.
- Add Qoder client compatibility: `chilon-recall qoder <directory>` generates `.qoder/mcp.json`, project-level skills, and a retrieval rule file from the bundled definitions.
- Document the Qoder client setup in both READMEs; the generated files stay credential-free.

## [0.1.2] - 2026-08-26

- Normalize file and project paths before deriving relative source paths, fixing Windows 8.3 short-path and long-path mismatches.
- Add a Windows-only regression test for chunking a file reached through its 8.3 path.

## [0.1.1] - 2026-08-26

- Add `chilon-recall install <directory>` to create a private configuration and install the managed Python engine in one command.
- Keep provider credentials out of installation output and configuration files.
- Exclude temporary npm caches from publication scanning and repository tracking.

## [0.1.0] - 2026-08-13

- Initial local-first MCP knowledge engine.
- Source-backed query and learning workflows.
- Staged index builds with recoverable backup, clear, and restore operations.
- OpenAI-compatible embedding and Cohere-compatible reranking adapters.
- Codex plugin metadata and Claude Desktop/Codex setup guides.
- npm/npx CLI with safe config initialization, managed Python engine setup, diagnostics, and stdio MCP startup.
- DeepSeek Harness bundle integration through the official DSH MCP client bridge.
