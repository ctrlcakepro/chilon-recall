# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Add Qoder IDE compatibility: `chilon-recall qoder <directory>` generates `.qoder/mcp.json`, project-level skills, and a retrieval rule file from the bundled definitions.
- Document the Qoder client setup in both READMEs; the generated files stay credential-free.

## [0.1.3] - 2026-09-05

- Add `rag_sync`: a staged, content-hash incremental synchronization of the knowledge index. Unchanged files reuse their existing vectors; added, modified, and deleted files are reconciled.
- Record a version 2 index manifest with per-file SHA-256 source hashes and the indexing settings the vectors were produced under.
- Fall back to a full rebuild when indexing settings change, when an older manifest lacks the hashes, or when existing metadata is not covered by its manifest.
- Keep `rag_build` as the deliberate full-rebuild entry point; both paths use the same preview/execute confirmation and staged index swap.

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
