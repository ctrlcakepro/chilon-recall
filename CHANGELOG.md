# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.4] - 2026-09-18

- Add `chilon-recall key`: a hidden-input prompt for a provider API key that calls the provider's own `/models` endpoint, suggests an embedding and reranker model, and prints ready-to-run `$env:`/`setx`/`export` commands. The key is used for a single request and is never written to disk.
- Fix `doctor` reporting `configuration.ready`/`credentials_ready: true` while `embedding.base_url`/`model` were still the install template's placeholder values.
- Fix the CLI entrypoint always exiting `0`: `main()`'s return value (notably `doctor`'s pass/fail code) was never applied to `process.exitCode`, so scripted checks against the exit code always saw success.
- Warn when `chilon-recall qoder` is run from an `npx` temporary cache: the generated `.qoder/mcp.json` embeds that ephemeral path, which breaks silently on the next cache clear or version bump.

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
