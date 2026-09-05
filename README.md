<div align="center">

# Chilon Recall

**Local-first knowledge retrieval for learning and serious knowledge work.**

[![version](https://img.shields.io/badge/version-0.1.3-blue.svg)](CHANGELOG.md)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![python](https://img.shields.io/badge/python-%3E%3D3.10-brightgreen.svg)](https://www.python.org)

English (this page) · [简体中文](README.zh-CN.md)

[Quick start](#quick-start) · [Tools](#what-you-can-do) · [MCP clients](#connect-an-mcp-client) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

</div>

---

Chilon Recall turns your own text documents into a private, source-backed knowledge base that any local MCP client can use. Ask what your materials say, compare concepts, build review outlines, or recover a claim from months of notes — while keeping source paths, evidence boundaries, and index operations visible.

It is an independent retrieval companion in the [Chilon Knowledge Work Harness](https://github.com/ctrlcakepro/chilon-knowledge-work-harness) family. The two projects remain separate: Chilon Recall owns local retrieval; the harness can orchestrate broader long-running knowledge work.

## Contents

- [Quick start](#quick-start)
- [Why Chilon Recall?](#why-chilon-recall)
- [What you can do](#what-you-can-do)
- [Detailed setup](#detailed-setup)
- [Connect an MCP client](#connect-an-mcp-client)
- [How it works](#how-it-works)
- [Tool reference](#tool-reference)
- [Provider configuration](#provider-configuration)
- [Data safety](#data-safety)
- [Limits](#limits)
- [Roadmap](#roadmap)
- [Development](#development)

## Quick start

> **New to MCP?** You only need a document folder, Node.js 20+, and Python 3.10+. Follow these three steps first; client configuration and technical details come later.

### 1. Install into your document folder

Run the command below once. It creates a private configuration and a managed Python engine; it never stores API keys in the package or configuration file.

```powershell
npx -y chilon-recall@0.1.3 install C:\path\to\your\documents
```

### 2. Set your provider key

Open the generated `chilon-recall.json` to choose the provider endpoint and model, then set the key only in your environment. Run `doctor` to confirm the setup.

```powershell
$env:RAG_MANAGER_CONFIG = "C:\path\to\your\documents\chilon-recall.json"
$env:RAG_API_KEY = "your-provider-key"
npx -y chilon-recall@0.1.3 doctor
```

### 3. Connect one client

Start with [Codex](#codex), [Claude Desktop](#claude-desktop), or [Qoder](#qoder). The client starts the local server for you; you do not need to keep a separate terminal open.

## Why Chilon Recall?

| | |
| --- | --- |
| **Grounded learning** | Answer from the material you chose, not from an untraceable memory of it. |
| **Source-backed answers** | Every hit carries a relative file path, headings, an approximate line number, and retrieval scores. |
| **Local-first control** | Documents and FAISS indexes stay on your machine. Only the text sent to your configured embedding/reranking providers leaves it. |
| **Safe operations** | Builds happen in staging; clear and restore actions use previews, short-lived confirmation tokens, and recoverable backups. |
| **MCP portability** | One `stdio` server works with Codex, Claude Desktop, Qoder, and other MCP-compatible local clients. |

## What you can do

Chilon Recall supports both direct retrieval and reusable learning workflows:

| Need | Tool | What it returns |
| --- | --- | --- |
| Recover a claim from notes or reports | `rag_query` | Ranked passages with source metadata |
| Answer from course or reference material | `textbook_qa` | Direct-answer evidence packet |
| Distinguish two ideas or methods | `concept_compare` | Evidence for a comparison table |
| Turn a chapter into structured notes | `chapter_summary` | Broad summary evidence and coverage cautions |
| Prepare for review or an exam | `review_outline` | Concepts, relationships, confusions, and practice prompts |
| Refresh the index after documents change | `rag_sync` | Added/modified/deleted/unchanged file counts, plus reused and re-embedded vector counts |

The bundled synthetic demo material covers retrieval practice, spaced review, evidence boundaries, and research triangulation. It is safe to redistribute and contains no private or copyrighted textbook content.

## Detailed setup

### 1. Install with npm

Requires Node.js 20+ and Python 3.10+.

Use the published, pinned npm release to create a private configuration and install the isolated Python engine with one command:

```powershell
npx -y chilon-recall@0.1.3 install C:\path\to\your\documents
```

This writes `chilon-recall.json` in the document directory and creates a persistent managed Python engine in the operating system's user-data area. Both files are required for local operation; credentials remain outside both of them.

- The managed engine lives outside the temporary npx cache. Set `CHILON_RECALL_HOME` to choose a different persistent location.
- Run `setup` again after upgrading the package.
- Installation never writes credentials anywhere. Set the provider key in your own environment afterwards.

To validate the runtime and private configuration:

```powershell
$env:RAG_MANAGER_CONFIG = "C:\path\to\your\documents\chilon-recall.json"
$env:RAG_API_KEY = "your-provider-key"
npx -y chilon-recall@0.1.3 doctor
```

> If you installed from npm, skip ahead to [Connect an MCP client](#connect-an-mcp-client). The remaining subsections are for source checkouts and custom configurations.

### 2. Manual private configuration

Copy `config/chilon-recall.example.json` to `config/chilon-recall.json`. The destination is ignored by Git.

Set `project_dir` to the folder containing your documents and `rag_dir` to a dedicated child directory. Keep credentials out of JSON:

```powershell
# Windows PowerShell
$env:RAG_MANAGER_CONFIG = (Resolve-Path .\config\chilon-recall.json)
$env:RAG_API_KEY = "your-provider-key"
$env:CHILON_RECALL_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe)
```

```bash
# macOS or Linux
export RAG_MANAGER_CONFIG="$PWD/config/chilon-recall.json"
export RAG_API_KEY="your-provider-key"
export CHILON_RECALL_PYTHON="$PWD/.venv/bin/python"
```

`config/siliconflow.example.json` is included as a provider example. Chilon Recall is not tied to SiliconFlow: embeddings use an OpenAI-compatible `/embeddings` endpoint, and reranking uses a Cohere-compatible rerank endpoint. Disable reranking if your provider does not offer it.

### 3. Start the source-checkout MCP server

```bash
npm start
```

The server uses `stdio`, so it normally runs under an MCP client rather than in a standalone interactive terminal. Connect it, call `rag_status`, preview `rag_build`, and execute the build with the returned confirmation token. After documents change, refresh with `rag_sync` instead of rebuilding; it reuses vectors for unchanged files.

## Connect an MCP client

Use absolute paths in client configuration. They are more reliable than assuming a launch directory.

| Client | Configuration entry point |
| --- | --- |
| [Codex](#codex) | `~/.codex/config.toml`, `codex mcp add`, or ChatGPT desktop **Settings → MCP servers** |
| [DeepSeek Harness](#deepseek-harness) | `dsh --patch` overlay or an installed profile bundle |
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` |
| [Qoder](#qoder) | **Qoder IDE Settings → MCP → My Servers** plus a generated `.qoder/` directory |

### Codex

Current Codex clients support local `stdio MCP` servers and share the same `config.toml`. Add a server through the ChatGPT desktop app's **Settings → MCP servers**, with `codex mcp add`, or in `~/.codex/config.toml`.

**Source checkout:**

```toml
[mcp_servers.chilon-recall]
command = "node"
args = ["/absolute/path/to/chilon-recall/scripts/server.mjs"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY", "CHILON_RECALL_PYTHON"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

**npm release** — run `npx -y chilon-recall@0.1.3 setup` first under the same OS account. A pinned version prevents an unexpected package upgrade from changing a working MCP server.

```toml
[mcp_servers.chilon-recall]
command = "npx"
args = ["-y", "chilon-recall@0.1.3", "mcp"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

The repository is also a valid Codex plugin (`.codex-plugin/plugin.json`, `.mcp.json`, and bundled skills). For a cloned source checkout, use the direct `node` configuration above and set `CHILON_RECALL_PYTHON` to its virtual environment.

### DeepSeek Harness

The repository ships a DeepSeek Harness bundle. It uses DSH's official `@deepseek-ai/dsh-mcp-client` bridge, so the existing MCP tools appear under stable names such as `mcp__chilon-recall__rag_status`; the retrieval engine is not duplicated and credentials are not sent as tool arguments.

> **Current DSH limitation:** the bundle forwards only `RAG_MANAGER_CONFIG`, `RAG_API_KEY`, `RAG_RERANK_API_KEY`, `CHILON_RECALL_HOME`, and `CHILON_RECALL_PYTHON`. Use the standard RAG key variable names with DSH until arbitrary `api_key_env` forwarding is added.

**One-off run** — apply the overlay without installing the bundle:

```powershell
$env:CHILON_RECALL_ROOT = (Resolve-Path .).Path
$env:RAG_MANAGER_CONFIG = (Resolve-Path .\config\chilon-recall.json).Path
$env:RAG_API_KEY = "your-provider-key"
dsh --profile web --patch .\dsh\cordis.patch.yml
```

**Persistent profile** — install the repository bundle once, then boot the profile. On Windows, current DSH/pnpm path forwarding can split a source path containing spaces; use its 8.3 short path when necessary:

```powershell
$bundlePathForDsh = (cmd /c "for %I in (.) do @echo %~sI").Trim()
dsh plugin --profile web add $bundlePathForDsh
dsh --profile web
```

The bundle runs `node scripts/cli.mjs mcp` from `CHILON_RECALL_ROOT`. Set `RAG_RERANK_API_KEY`, `CHILON_RECALL_HOME`, or `CHILON_RECALL_PYTHON` when your private configuration needs them. DSH is still a developer-preview product, so its bundle or plugin APIs may change independently of Chilon Recall.

### Claude Desktop

Add this to `claude_desktop_config.json`, replacing every example path:

```json
{
  "mcpServers": {
    "chilon-recall": {
      "command": "node",
      "args": [
        "/absolute/path/to/chilon-recall/scripts/server.mjs"
      ],
      "env": {
        "RAG_MANAGER_CONFIG": "/absolute/path/to/chilon-recall/config/chilon-recall.json",
        "CHILON_RECALL_PYTHON": "/absolute/path/to/chilon-recall/.venv/bin/python"
      }
    }
  }
}
```

For an npm release, replace `command` and `args` with the following and omit `CHILON_RECALL_PYTHON`; `setup` manages it:

```json
"command": "npx",
"args": ["-y", "chilon-recall@0.1.3", "mcp"]
```

Set `RAG_API_KEY` in the environment inherited by Claude Desktop, or add it only to your private local client configuration when your operating system cannot provide it. Claude Desktop stores `env` values in a local JSON file, so restrict file permissions and never commit that file. On Windows, use the virtual environment's `python.exe` path.

### Qoder

Qoder IDE loads MCP servers from its own settings, and project-level skills and rules from the `.qoder/` directory. Generate all three from a checkout or an npm install:

```powershell
npx -y chilon-recall@0.1.3 qoder C:\path\to\your\project
```

This writes `.qoder/mcp.json`, `.qoder/skills/<name>/SKILL.md` for every bundled skill, and `.qoder/rules/chilon-recall.md`. Add `--force` to regenerate over existing files.

Qoder does not read `.qoder/mcp.json` automatically; it is a shareable snippet. Open **Qoder IDE Settings → MCP → My Servers → + Add**, paste its contents, and replace the `RAG_MANAGER_CONFIG` placeholder with your private configuration path:

```json
{
  "mcpServers": {
    "chilon-recall": {
      "command": "node",
      "args": [
        "/absolute/path/to/chilon-recall/scripts/cli.mjs",
        "mcp"
      ],
      "env": {
        "RAG_MANAGER_CONFIG": "<absolute path to your private chilon-recall.json>"
      }
    }
  }
}
```

Set `RAG_API_KEY` (and `RAG_RERANK_API_KEY` when reranking is enabled) in the environment Qoder inherits. The generated files are safe to commit; credentials never belong in them. Restart Qoder IDE so the generated skills and rules load, then confirm the tools under **My Servers**.

## How it works

```text
Private text documents
        │
        ▼
heading-aware chunking ──► OpenAI-compatible embeddings
        │
        ▼
 local FAISS index + JSON source metadata
        │
question ──► vector recall ──► optional reranking
        │
        ▼
structured MCP evidence with relative source paths
```

The Node.js MCP host owns configuration validation, source discovery, approval tokens, path safety, backups, and client-facing tools. The Python engine owns chunking, provider calls, FAISS serialization, and retrieval. Index files are read and written through Python byte I/O so non-ASCII paths work reliably on Windows.

## Tool reference

**Read-only tools:**

`rag_status` · `rag_list_documents` · `rag_query` · `rag_list_backups` · `textbook_qa` · `concept_compare` · `chapter_summary` · `review_outline`

**Configuration and index tools:**

- `rag_save_config` updates only schema-approved, non-secret fields and creates a backup of the JSON file.
- `rag_build`, `rag_sync`, `rag_clear_index`, and `rag_restore_index` require `action: "preview"` first. The preview returns a short-lived token bound to the current configuration and source/index state.
- `rag_sync` hashes files, reuses compatible unchanged vectors, and reconciles added, modified, and deleted files. It falls back to a full rebuild when indexing settings change or an older manifest lacks the required hashes.

## Provider configuration

### Embeddings

The first release supports the `openai-compatible` adapter. Configure `base_url`, `model`, `api_key_env`, and optionally `doc_prefix` and `query_prefix`.

The key itself must exist only in the named environment variable.

### Reranking

The `cohere-compatible` adapter sends `model`, `query`, `documents`, `top_n`, and `return_documents` to the configured URL. Set `enabled` to `false` to return top FAISS matches directly.

> Provider compatibility is an interface claim, not a guarantee that every nominally compatible service behaves identically. Test your selected models with the synthetic demo before indexing private documents or incurring large costs.

## Data safety

- The server binds to one `RAG_MANAGER_CONFIG`; individual tool calls cannot select arbitrary configuration files.
- Secret-shaped keys are rejected in Python configuration loading. Provider credentials come from environment variables.
- Absolute source paths are hidden unless `display.expose_absolute_paths` is explicitly enabled.
- The active index, staging area, and backups must resolve inside `rag_dir`; root and out-of-bound operations are rejected.
- A new build never modifies the active index until all required files exist.
- Clearing moves the active index into `backups/`. Restoring backs up the current index first.
- Confirmation tokens expire after ten minutes, are single-use, and become invalid if source, config, or index state changes.

Before publishing changes, run:

```bash
npm run check
npm audit --audit-level=high
```

The publication check rejects likely secrets, personal email addresses, and user-profile paths in tracked source files.

## Limits

- Version 0.1.3 indexes UTF-8 `.md`, `.txt`, `.rst`, and `.csv` text. Convert PDFs to reviewed text first; scanned PDFs need OCR.
- The included chunker recognizes Markdown `#` and `##` headings. It does not yet parse tables, citations, or document-native structure semantically.
- `rag_build` is a deliberate full rebuild. Use `rag_sync` for content-hash incremental synchronization; it always writes a new staged FAISS index so row IDs remain aligned with metadata.
- Local embedding and reranker models are not bundled in the first release.
- Retrieval returns evidence candidates; it does not prove that the collection is complete, current, correct, or internally consistent.

## Roadmap

- First-class PDF extraction/OCR adapters with coverage reports
- Local embedding and reranking providers
- Additional source filters and collection namespaces
- Evaluation fixtures for retrieval quality and citation coverage
- Publish the validated npm package and a separate Python engine package

## Development

Use this workflow only when developing Chilon Recall, or when you need a source-based configuration instead of the npm installer:

```bash
git clone https://github.com/ctrlcakepro/chilon-recall.git
cd chilon-recall
npm install
python -m venv .venv
```

Activate the virtual environment, then install the Python engine:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

```bash
# macOS or Linux
source .venv/bin/activate
python -m pip install -e .
```

Then run the checks:

```bash
npm run check
```

Tests use synthetic documents and mock provider endpoints, so they do not need a paid API key. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 ctrlcakepro and contributors.
