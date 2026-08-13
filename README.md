# Chilon Recall

**Local-first knowledge retrieval for learning and serious knowledge work.**

[简体中文](README.zh-CN.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

Chilon Recall turns your own text documents into a private, source-backed knowledge base that any local MCP client can use. Ask what your materials say, compare concepts, build review outlines, or recover a claim from months of notes—while keeping source paths, evidence boundaries, and index operations visible.

It is an independent retrieval companion in the [Chilon Knowledge Work Harness](https://github.com/ctrlcakepro/chilon-knowledge-work-harness) family. The two projects remain separate: Chilon Recall owns local retrieval; the harness can orchestrate broader long-running knowledge work.

## Why Chilon Recall?

- **Grounded learning** — answer from the material you chose, not from an untraceable memory of it.
- **Source-backed answers** — every hit carries a relative file path, headings, an approximate line number, and retrieval scores.
- **Local-first control** — documents and FAISS indexes stay on your machine. Only the text sent to your configured embedding/reranking providers leaves it.
- **Safe operations** — builds happen in staging; clear and restore actions use previews, short-lived confirmation tokens, and recoverable backups.
- **MCP portability** — one `stdio` server works with Codex, Claude Desktop, and other MCP-compatible local clients.

## Built for learning and knowledge work

Chilon Recall supports both direct retrieval and reusable learning workflows:

| Need | Tool | What it returns |
| --- | --- | --- |
| Recover a claim from notes or reports | `rag_query` | Ranked passages with source metadata |
| Answer from course or reference material | `textbook_qa` | Direct-answer evidence packet |
| Distinguish two ideas or methods | `concept_compare` | Evidence for a comparison table |
| Turn a chapter into structured notes | `chapter_summary` | Broad summary evidence and coverage cautions |
| Prepare for review or an exam | `review_outline` | Concepts, relationships, confusions, and practice prompts |

The bundled synthetic demo material covers retrieval practice, spaced review, evidence boundaries, and research triangulation. It is safe to redistribute and contains no private or copyrighted textbook content.

## Five-minute quick start

### 1. Install the runtimes

You need Node.js 20+ and Python 3.10+.

```bash
git clone https://github.com/ctrlcakepro/chilon-recall.git
cd chilon-recall
npm install
python -m venv .venv
```

Activate the virtual environment:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS or Linux
source .venv/bin/activate
```

Then install the Python engine:

```bash
python -m pip install -e .
```

### 2. Create a private configuration

Copy `config/chilon-recall.example.json` to `config/chilon-recall.json`. The destination is ignored by Git.

Set `project_dir` to the folder containing your documents and `rag_dir` to a dedicated child directory. Keep credentials out of JSON:

```powershell
$env:RAG_MANAGER_CONFIG = (Resolve-Path .\config\chilon-recall.json)
$env:RAG_API_KEY = "your-provider-key"
$env:CHILON_RECALL_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe)
```

```bash
export RAG_MANAGER_CONFIG="$PWD/config/chilon-recall.json"
export RAG_API_KEY="your-provider-key"
export CHILON_RECALL_PYTHON="$PWD/.venv/bin/python"
```

`config/siliconflow.example.json` is included as a provider example. Chilon Recall is not tied to SiliconFlow: embeddings use an OpenAI-compatible `/embeddings` endpoint, and reranking uses a Cohere-compatible rerank endpoint. Disable reranking if your provider does not offer it.

### 3. Start the MCP server

```bash
npm start
```

The server uses `stdio`, so it normally runs under an MCP client rather than in a standalone interactive terminal. Connect it, call `rag_status`, preview `rag_build`, and execute the build with the returned confirmation token.

## Connect an MCP client

Use absolute paths in client configuration. They are more reliable than assuming a launch directory.

### Codex

Current Codex clients support local `stdio MCP` servers and share the same `config.toml`. Add a server through the ChatGPT desktop app's **Settings → MCP servers**, with `codex mcp add`, or in `~/.codex/config.toml`:

```toml
[mcp_servers.chilon-recall]
command = "node"
args = ["/absolute/path/to/chilon-recall/scripts/server.mjs"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY", "CHILON_RECALL_PYTHON"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

The repository is also a valid Codex plugin (`.codex-plugin/plugin.json`, `.mcp.json`, and bundled skills). For a cloned source checkout, direct MCP configuration remains the clearest installation method until a registry package is published.

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

Set `RAG_API_KEY` in the environment inherited by Claude Desktop, or add it only to your private local client configuration when your operating system cannot provide it. Claude Desktop stores `env` values in a local JSON file, so restrict file permissions and never commit that file. On Windows, use the virtual environment's `python.exe` path.

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

Read-only tools:

- `rag_status`
- `rag_list_documents`
- `rag_query`
- `rag_list_backups`
- `textbook_qa`
- `concept_compare`
- `chapter_summary`
- `review_outline`

Configuration and index tools:

- `rag_save_config` updates only schema-approved, non-secret fields and creates a backup of the JSON file.
- `rag_build`, `rag_clear_index`, and `rag_restore_index` require `action: "preview"` first. The preview returns a short-lived token bound to the current configuration and source/index state. Use that token once with `action: "execute"`.

## Provider configuration

### Embeddings

The first release supports the `openai-compatible` adapter. Configure:

- `base_url`
- `model`
- `api_key_env`
- optional `doc_prefix` and `query_prefix`

The key itself must exist only in the named environment variable.

### Reranking

The `cohere-compatible` adapter sends `model`, `query`, `documents`, `top_n`, and `return_documents` to the configured URL. Set `enabled` to `false` to return top FAISS matches directly.

Provider compatibility is an interface claim, not a guarantee that every nominally compatible service behaves identically. Test your selected models with the synthetic demo before indexing private documents or incurring large costs.

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

- Version 0.1.0 indexes UTF-8 `.md`, `.txt`, `.rst`, and `.csv` text. Convert PDFs to reviewed text first; scanned PDFs need OCR.
- The included chunker recognizes Markdown `#` and `##` headings. It does not yet parse tables, citations, or document-native structure semantically.
- Rebuilding is full-index, not incremental.
- Local embedding and reranker models are not bundled in the first release.
- Retrieval returns evidence candidates; it does not prove that the collection is complete, current, correct, or internally consistent.

## Roadmap

- Incremental indexing and content hashing
- First-class PDF extraction/OCR adapters with coverage reports
- Local embedding and reranking providers
- Additional source filters and collection namespaces
- Evaluation fixtures for retrieval quality and citation coverage
- npm/PyPI distribution after the source-install workflow stabilizes

## Development

```bash
npm install
python -m pip install -e .
npm run check
```

Tests use synthetic documents and mock provider endpoints, so they do not need a paid API key. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 ctrlcakepro and contributors.
