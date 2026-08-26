# Changelog

All notable changes to this project will be documented in this file.

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
