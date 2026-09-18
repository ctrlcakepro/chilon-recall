# Chilon Recall

**Local-first knowledge retrieval for learning and serious knowledge work.**

**面向学习与严肃知识工作的本地优先知识检索。**

**Documentation:** English (this page) · **[简体中文（完整文档）](README.zh-CN.md)**

**文档语言：** English（当前页面，逐段双语）· **[简体中文（完整文档）](README.zh-CN.md)**

[Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

[安全策略](SECURITY.md) · [参与贡献](CONTRIBUTING.md)

Chilon Recall turns your own text documents into a private, source-backed knowledge base that any local MCP client can use. Ask what your materials say, compare concepts, build review outlines, or recover a claim from months of notes—while keeping source paths, evidence boundaries, and index operations visible.

Chilon Recall 将你自己的文本资料转换为私有、来源可追溯的知识库，并可供任何本地 MCP 客户端调用。你可以询问资料内容、比较概念、制作复习提纲，或从长期笔记中找回论据，同时保留来源路径、证据边界和索引操作的可见性。

It is an independent retrieval companion in the [Chilon Knowledge Work Harness](https://github.com/ctrlcakepro/chilon-knowledge-work-harness) family. The two projects remain separate: Chilon Recall owns local retrieval; the harness can orchestrate broader long-running knowledge work.

它是 [Chilon Knowledge Work Harness](https://github.com/ctrlcakepro/chilon-knowledge-work-harness) 产品线中的独立检索组件。两个项目保持分离：Chilon Recall 负责本地检索；harness 可编排更广泛的长期知识工作。

## Start here / 新手先看

**New to MCP? You only need a document folder, Node.js 20+, and Python 3.10+. Follow these three steps first; client configuration and technical details come later.**

**第一次接触 MCP？你只需要一个资料文件夹、Node.js 20+ 和 Python 3.10+。先完成下面三步；客户端配置和技术细节在后文。**

1. **Install into your document folder / 安装到资料文件夹。** Run the command below once. It creates a private configuration and a managed Python engine; it never stores API keys in the package or configuration file.

   **运行一次下面的命令。** 它会创建私有配置与受管 Python engine；不会把 API key 写入 package 或配置文件。

   ```powershell
   npx -y chilon-recall@0.1.3 install C:\path\to\your\documents
   ```

2. **Set your provider key / 设置 provider key。** Open the generated `chilon-recall.json` to choose the provider endpoint and model, then set the key only in your environment. Run `doctor` to confirm the setup.

   **打开生成的 `chilon-recall.json` 选择 provider endpoint 与 model，再只在环境变量中设置密钥。** 运行 `doctor` 确认环境可用。

   ```powershell
   $env:RAG_MANAGER_CONFIG = "C:\path\to\your\documents\chilon-recall.json"
   $env:RAG_API_KEY = "your-provider-key"
   npx -y chilon-recall@0.1.3 doctor
   ```

3. **Connect one client / 连接一个客户端。** Start with [Codex](#codex--codex-配置), [Claude Desktop](#claude-desktop--claude-desktop-配置), or [Qoder](#qoder--qoder-配置). The client starts the local server for you; you do not need to keep a separate terminal open.

   **从 [Codex](#codex--codex-配置)、[Claude Desktop](#claude-desktop--claude-desktop-配置) 或 [Qoder](#qoder--qoder-配置) 开始即可。** 客户端会替你启动本地 server，无需另开终端长期运行。

## Why Chilon Recall? / 为什么使用 Chilon Recall？

- **Grounded learning** — answer from the material you chose, not from an untraceable memory of it.
- **基于资料学习**——先回答“你选择的资料说了什么”，而不是依赖无法追溯的模型印象。
- **Source-backed answers** — every hit carries a relative file path, headings, an approximate line number, and retrieval scores.
- **答案可追溯**——每条结果都包含相对文件路径、标题层级、近似行号和检索分数。
- **Local-first control** — documents and FAISS indexes stay on your machine. Only the text sent to your configured embedding/reranking providers leaves it.
- **本地优先控制**——文档和 FAISS 索引保留在你的设备上；只有发送给自选 embedding/reranking provider 的文本会离开设备。
- **Safe operations** — builds happen in staging; clear and restore actions use previews, short-lived confirmation tokens, and recoverable backups.
- **安全操作**——建库在 staging 目录中完成；清理和恢复使用预览、短期确认 token 与可恢复备份。
- **MCP portability** — one `stdio` server works with Codex, Claude Desktop, Qoder, and other MCP-compatible local clients.
- **MCP 可移植性**——同一个 `stdio` server 可用于 Codex、Claude Desktop、Qoder 及其他兼容的本地客户端。

## Built for learning and knowledge work / 为学习与知识工作而设计

Chilon Recall supports both direct retrieval and reusable learning workflows:

Chilon Recall 同时支持直接检索和可复用的学习工作流：

| Need / 需求 | Tool / 工具 | What it returns / 返回内容 |
| --- | --- | --- |
| Recover a claim from notes or reports<br>从笔记或报告找回论据 | `rag_query` | Ranked passages with source metadata<br>带来源元数据的排序片段 |
| Answer from course or reference material<br>基于课程或参考资料回答问题 | `textbook_qa` | Direct-answer evidence packet<br>直接回答所需的证据包 |
| Distinguish two ideas or methods<br>区分两个概念或方法 | `concept_compare` | Evidence for a comparison table<br>适合整理比较表的证据 |
| Turn a chapter into structured notes<br>将章节转为结构化笔记 | `chapter_summary` | Broad summary evidence and coverage cautions<br>章节总结证据与覆盖提醒 |
| Prepare for review or an exam<br>复习或备考 | `review_outline` | Concepts, relationships, confusions, and practice prompts<br>概念、联系、易混点与练习提示 |
| Refresh the index after documents change<br>资料变更后刷新索引 | `rag_sync` | Added, modified, deleted, and unchanged file counts with reused and re-embedded vector counts<br>新增、修改、删除、未变更的文件数，以及复用与重新嵌入的向量数 |

The bundled synthetic demo material covers retrieval practice, spaced review, evidence boundaries, and research triangulation. It is safe to redistribute and contains no private or copyrighted textbook content.

仓库附带的合成演示资料涵盖检索练习、间隔复习、证据边界和研究三角验证。它可以安全再分发，不包含个人资料或受版权保护的教材内容。

## Detailed setup and configuration / 详细安装与配置

### 1. Install with npm / npm 安装

You need Node.js 20+ and Python 3.10+.

需要 Node.js 20+ 和 Python 3.10+。

Use the published, pinned npm release to create a private configuration and install the isolated Python engine with one command:

使用已发布且固定版本的 npm package，只需一条命令即可创建私有配置并安装独立 Python engine：

```powershell
npx -y chilon-recall@0.1.3 install C:\path\to\your\documents
```

The managed engine lives outside the temporary npx cache. Use CHILON_RECALL_HOME to choose a different persistent location, and run `setup` after upgrading the package.

托管 engine 保存在临时 npx cache 之外。可用 CHILON_RECALL_HOME 指定其他持久位置；升级 package 后再次运行 `setup`。

The command writes `chilon-recall.json` in the document directory and creates a persistent managed Python engine in the operating system's user-data area (or CHILON_RECALL_HOME). These files are required for local operation; credentials remain outside both files.

该命令会在资料目录写入 `chilon-recall.json`，并在操作系统用户数据目录（或 CHILON_RECALL_HOME）创建持久的受管 Python engine。这些文件是本地运行所必需的；凭据不会写入其中。

Installation never writes credentials into the package or configuration file. To query or build an index, set the provider key in your own environment after installation.

安装过程不会把凭据写入 package 或配置文件。要执行查询或建库，请在安装完成后由你自己在环境变量中设置 provider key。

To validate the runtime and private configuration, set RAG_MANAGER_CONFIG and the provider credentials, then run:

设置 RAG_MANAGER_CONFIG 与 provider 凭据后，可运行以下命令检查运行环境和私有配置：

```powershell
$env:RAG_MANAGER_CONFIG = "C:\path\to\your\documents\chilon-recall.json"
$env:RAG_API_KEY = "your-provider-key"
npx -y chilon-recall@0.1.3 doctor
```

If you installed from npm, you can now skip to [Connect an MCP client](#connect-an-mcp-client--连接-mcp-客户端). The remaining setup details are for source checkouts or custom configurations.

如果你通过 npm 安装，现在可以直接前往 [连接 MCP 客户端](#connect-an-mcp-client--连接-mcp-客户端)。以下内容面向源码 checkout 或需要自定义配置的用户。

### 2. Manual private configuration / 手动私有配置

Copy `config/chilon-recall.example.json` to `config/chilon-recall.json`. The destination is ignored by Git.

将 `config/chilon-recall.example.json` 复制为 `config/chilon-recall.json`。目标文件已被 Git 忽略。

Set `project_dir` to the folder containing your documents and `rag_dir` to a dedicated child directory. Keep credentials out of JSON:

将 `project_dir` 设为资料目录，将 `rag_dir` 设为其中的专用子目录。不要把凭据写入 JSON：

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

仓库提供 `config/siliconflow.example.json` 作为 provider 示例，但 Chilon Recall 并不绑定 SiliconFlow：embedding 使用 OpenAI-compatible `/embeddings` endpoint，reranking 使用 Cohere-compatible rerank endpoint。若 provider 不提供 reranker，可将其禁用。

### 3. Start the source-checkout MCP server / 启动源码 checkout 的 MCP server

```bash
npm start
```

The server uses `stdio`, so it normally runs under an MCP client rather than in a standalone interactive terminal. Connect it, call `rag_status`, preview `rag_build`, and execute the build with the returned confirmation token. After documents change, refresh with `rag_sync` instead of rebuilding; it reuses vectors for unchanged files.

server 使用 `stdio`，因此通常由 MCP client 启动，而不是作为独立交互式终端运行。连接后，先调用 `rag_status`，预览 `rag_build`，再使用返回的 confirmation token 执行建库。资料发生变更后，请用 `rag_sync` 刷新而不是重建；未变更文件会复用已有向量。

## Connect an MCP client / 连接 MCP client

Use absolute paths in client configuration. They are more reliable than assuming a launch directory.

客户端配置应使用绝对路径，避免依赖不确定的启动目录。

### Codex / Codex 配置

Current Codex clients support local `stdio MCP` servers and share the same `config.toml`. Add a server through the ChatGPT desktop app's **Settings → MCP servers**, with `codex mcp add`, or in `~/.codex/config.toml`:

当前 Codex client 支持本地 `stdio MCP` server，并共享同一份 `config.toml`。可通过 ChatGPT desktop app 的 **Settings → MCP servers**、`codex mcp add`，或在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.chilon-recall]
command = "node"
args = ["/absolute/path/to/chilon-recall/scripts/server.mjs"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY", "CHILON_RECALL_PYTHON"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

For an npm release, use a pinned npx command instead. Run npx -y chilon-recall@0.1.3 setup first under the same OS account. A pinned version prevents an unexpected package upgrade from changing a working MCP server.

对于 npm 已发布版本，请改用固定版本的 npx 命令。先在同一操作系统账户下运行 npx -y chilon-recall@0.1.3 setup；固定版本可避免 package 意外升级改变已正常工作的 MCP server。

```toml
[mcp_servers.chilon-recall]
command = "npx"
args = ["-y", "chilon-recall@0.1.3", "mcp"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

The repository is also a valid Codex plugin (`.codex-plugin/plugin.json`, `.mcp.json`, and bundled skills). For a cloned source checkout, use the direct node configuration above and set CHILON_RECALL_PYTHON to its virtual environment.

仓库也是合法的 Codex plugin，包含 `.codex-plugin/plugin.json`、`.mcp.json` 与内置 skills。源码 clone 时请使用上方直接 node 配置，并将 CHILON_RECALL_PYTHON 指向对应 virtual environment。

### DeepSeek Harness / DeepSeek Harness 配置

The repository also ships a DeepSeek Harness bundle. It uses DSH's official `@deepseek-ai/dsh-mcp-client` bridge, so the existing MCP tools appear under stable names such as `mcp__chilon-recall__rag_status`; the retrieval engine is not duplicated and credentials are not sent as tool arguments.

仓库同时提供 DeepSeek Harness bundle。它使用 DSH 官方的 `@deepseek-ai/dsh-mcp-client` bridge，因此现有 MCP 工具会以 `mcp__chilon-recall__rag_status` 等稳定名称出现；不会重复运行检索引擎，也不会把凭据作为 tool 参数传给模型。

For a source checkout, set an absolute project root and the same private configuration used by the ordinary MCP client. You can apply the bundle for a one-off run without installing it:

源码 checkout 可按以下方式设置绝对项目路径和同一份私有配置。一次性运行时无需安装 bundle，直接使用 overlay：

Current DSH limitation: the bundle forwards only RAG_MANAGER_CONFIG, RAG_API_KEY, RAG_RERANK_API_KEY, CHILON_RECALL_HOME, and CHILON_RECALL_PYTHON. Use the standard RAG key variable names with DSH until arbitrary `api_key_env` forwarding is added.

当前 DSH 限制：bundle 只转发 RAG_MANAGER_CONFIG、RAG_API_KEY、RAG_RERANK_API_KEY、CHILON_RECALL_HOME 和 CHILON_RECALL_PYTHON。在支持任意 `api_key_env` 转发之前，使用 DSH 时请采用标准 RAG 密钥环境变量名。

```powershell
$env:CHILON_RECALL_ROOT = (Resolve-Path .).Path
$env:RAG_MANAGER_CONFIG = (Resolve-Path .\config\chilon-recall.json).Path
$env:RAG_API_KEY = "your-provider-key"
dsh --profile web --patch .\dsh\cordis.patch.yml
```

For a persistent DSH profile, install the repository bundle once, then boot the profile. On Windows, current DSH/pnpm path forwarding can split a source path containing spaces; use its 8.3 short path when necessary:

如果要持久安装到 DSH profile，请先安装一次仓库 bundle，再启动 profile。Windows 当前 DSH/pnpm 的路径转发可能拆分含空格的源码路径，必要时请使用 8.3 短路径：

```powershell
$bundlePathForDsh = (cmd /c "for %I in (.) do @echo %~sI").Trim()
dsh plugin --profile web add $bundlePathForDsh
dsh --profile web
```

The bundle runs `node scripts/cli.mjs mcp` from `CHILON_RECALL_ROOT`. Set `RAG_RERANK_API_KEY`, `CHILON_RECALL_HOME`, or `CHILON_RECALL_PYTHON` when your private configuration needs them. DSH is still a developer-preview product, so its bundle or plugin APIs may change independently of Chilon Recall.

bundle 会在 `CHILON_RECALL_ROOT` 中运行 `node scripts/cli.mjs mcp`。如果私有配置需要，可继续设置 `RAG_RERANK_API_KEY`、`CHILON_RECALL_HOME` 或 `CHILON_RECALL_PYTHON`。DSH 仍属于 developer preview，其 bundle 或 plugin API 可能独立于 Chilon Recall 发生变化。

### Claude Desktop / Claude Desktop 配置

Add this to `claude_desktop_config.json`, replacing every example path:

将以下内容加入 `claude_desktop_config.json`，并替换所有示例路径：

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

For an npm release, replace command and args with the following and omit CHILON_RECALL_PYTHON; setup manages it:

对于 npm 已发布版本，请把 command 和 args 替换为以下内容，并省略 CHILON_RECALL_PYTHON；它由 setup 管理：

```json
"command": "npx",
"args": ["-y", "chilon-recall@0.1.3", "mcp"]
```

Set `RAG_API_KEY` in the environment inherited by Claude Desktop, or add it only to your private local client configuration when your operating system cannot provide it. Claude Desktop stores `env` values in a local JSON file, so restrict file permissions and never commit that file. On Windows, use the virtual environment's `python.exe` path.

应在 Claude Desktop 可继承的系统环境中设置 `RAG_API_KEY`；若操作系统无法提供，只能把它加入本机私有 client 配置。Claude Desktop 会将 `env` 值存入本地 JSON，因此应限制文件权限，且绝不能提交该文件。Windows 用户应指向虚拟环境中的 `python.exe`。

### Qoder / Qoder 配置

Qoder IDE loads MCP servers from its own settings, and project-level skills and rules from the `.qoder/` directory. Generate all three from a checkout or an npm install:

Qoder IDE 从自身设置中加载 MCP server，并从项目内的 `.qoder/` 目录加载项目级 skills 与 rules。可用一条命令生成这三部分：

```powershell
npx -y chilon-recall@0.1.3 qoder C:\path\to\your\project
```

This writes `.qoder/mcp.json`, `.qoder/skills/<name>/SKILL.md` for every bundled skill, and `.qoder/rules/chilon-recall.md`. Add `--force` to regenerate over existing files.

该命令会写入 `.qoder/mcp.json`、每个内置 skill 对应的 `.qoder/skills/<name>/SKILL.md`，以及 `.qoder/rules/chilon-recall.md`。若要覆盖已有文件，请加 `--force`。

Qoder does not read `.qoder/mcp.json` automatically; it is a shareable snippet. Open **Qoder IDE Settings → MCP → My Servers → + Add**, paste its contents, and replace the `RAG_MANAGER_CONFIG` placeholder with your private configuration path:

Qoder 不会自动读取 `.qoder/mcp.json`，它只是一份可共享的配置片段。请打开 **Qoder IDE Settings → MCP → My Servers → + Add**，粘贴其内容，并把 `RAG_MANAGER_CONFIG` 占位符替换为你的私有配置路径：

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

请在 Qoder 可继承的系统环境中设置 `RAG_API_KEY`（启用 reranking 时还需 `RAG_RERANK_API_KEY`）。生成的文件可以提交到版本库，其中绝不应写入凭据。重启 Qoder IDE 以加载生成的 skills 与 rules，并在 **My Servers** 中确认工具已出现。

## How it works / 工作原理

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

```text
私有文本资料
        │
        ▼
标题感知分块 ──► OpenAI-compatible embeddings
        │
        ▼
本地 FAISS 索引 + JSON 来源元数据
        │
问题 ──► 向量召回 ──► 可选 reranking
        │
        ▼
带相对来源路径的结构化 MCP 证据
```

The Node.js MCP host owns configuration validation, source discovery, approval tokens, path safety, backups, and client-facing tools. The Python engine owns chunking, provider calls, FAISS serialization, and retrieval. Index files are read and written through Python byte I/O so non-ASCII paths work reliably on Windows.

Node.js MCP host 负责配置验证、资料发现、approval token、路径安全、备份和面向 client 的工具。Python engine 负责分块、provider 调用、FAISS 序列化与检索。索引通过 Python byte I/O 读写，以便在 Windows 的非 ASCII 路径下可靠工作。

## Tool reference / 工具一览

Read-only tools:

只读工具：

- `rag_status`
- `rag_list_documents`
- `rag_query`
- `rag_list_backups`
- `textbook_qa`
- `concept_compare`
- `chapter_summary`
- `review_outline`

Configuration and index tools:

配置和索引工具：

- `rag_save_config` updates only schema-approved, non-secret fields and creates a backup of the JSON file.
- `rag_save_config` 仅修改 schema 允许的非敏感字段，并创建 JSON 文件备份。
- `rag_build`, `rag_sync`, `rag_clear_index`, and `rag_restore_index` require `action: "preview"` first. The preview returns a short-lived token bound to the current configuration and source/index state. `rag_sync` hashes files, reuses compatible unchanged vectors, and reconciles added, modified, and deleted files; it falls back to a full rebuild when indexing settings change or an older manifest lacks the required hashes.
- `rag_build`、`rag_sync`、`rag_clear_index` 与 `rag_restore_index` 必须先使用 `action: "preview"`。预览会返回一个绑定当前配置和来源/索引状态的短期 token。`rag_sync` 对文件进行哈希，复用兼容的未变更向量，并同步新增、修改和删除；索引设置变化或旧 manifest 缺少所需哈希时会回退为全量重建。

## Provider configuration / Provider 配置

### Embeddings / 向量化

The first release supports the `openai-compatible` adapter. Configure:

首版支持 `openai-compatible` adapter，需要配置：

- `base_url`
- `model`
- `api_key_env`
- optional `doc_prefix` and `query_prefix`

- `base_url`
- `model`
- `api_key_env`
- 可选的 `doc_prefix` 和 `query_prefix`

The key itself must exist only in the named environment variable.

key 本身只能存在于指定的环境变量中。

### Reranking / 重排序

The `cohere-compatible` adapter sends `model`, `query`, `documents`, `top_n`, and `return_documents` to the configured URL. Set `enabled` to `false` to return top FAISS matches directly.

`cohere-compatible` adapter 会向配置的 URL 发送 `model`、`query`、`documents`、`top_n` 和 `return_documents`。将 `enabled` 设为 `false` 可直接返回排名靠前的 FAISS matches。

Provider compatibility is an interface claim, not a guarantee that every nominally compatible service behaves identically. Test your selected models with the synthetic demo before indexing private documents or incurring large costs.

Provider 兼容性只是接口层面的声明，并不保证每个标称兼容的服务行为完全相同。在索引私有资料或产生较大费用前，应先用合成示例测试你选择的模型。

## Data safety / 数据安全

- The server binds to one `RAG_MANAGER_CONFIG`; individual tool calls cannot select arbitrary configuration files.
- server 固定绑定一个 `RAG_MANAGER_CONFIG`；单次 tool call 不能选择任意配置文件。
- Secret-shaped keys are rejected in Python configuration loading. Provider credentials come from environment variables.
- Python 配置加载会拒绝疑似 secret 的字段；provider 凭据从环境变量读取。
- Absolute source paths are hidden unless `display.expose_absolute_paths` is explicitly enabled.
- 除非显式启用 `display.expose_absolute_paths`，否则不会暴露绝对来源路径。
- The active index, staging area, and backups must resolve inside `rag_dir`; root and out-of-bound operations are rejected.
- active index、staging area 和 backups 必须解析到 `rag_dir` 内部；根目录和越界操作会被拒绝。
- A new build never modifies the active index until all required files exist.
- 新建库在所有必需文件就绪前绝不会修改 active index。
- Clearing moves the active index into `backups/`. Restoring backs up the current index first.
- 清理操作会把 active index 移入 `backups/`；恢复前会先备份当前索引。
- Confirmation tokens expire after ten minutes, are single-use, and become invalid if source, config, or index state changes.
- Confirmation token 十分钟后过期，且只能使用一次；来源、配置或索引状态变化时也会失效。

Before publishing changes, run:

发布修改前运行：

```bash
npm run check
npm audit --audit-level=high
```

The publication check rejects likely secrets, personal email addresses, and user-profile paths in tracked source files.

发布检查会拒绝 tracked source files 中疑似的 secret、个人邮箱和用户目录路径。

## Limits / 已知限制

- Version 0.1.3 indexes UTF-8 `.md`, `.txt`, `.rst`, and `.csv` text. Convert PDFs to reviewed text first; scanned PDFs need OCR.
- v0.1.3 只索引 UTF-8 `.md`、`.txt`、`.rst` 和 `.csv` 文本。PDF 应先转换为经过核对的文本；扫描版 PDF 需要 OCR。
- The included chunker recognizes Markdown `#` and `##` headings. It does not yet parse tables, citations, or document-native structure semantically.
- 内置 chunker 识别 Markdown `#` 和 `##` headings，暂时不会从语义上解析表格、引文或原生文档结构。
- `rag_build` is a deliberate full rebuild. Use `rag_sync` for content-hash incremental synchronization; it always writes a new staged FAISS index so row IDs remain aligned with metadata.
- `rag_build` 是明确的全量重建入口。内容哈希增量同步请使用 `rag_sync`；它始终在 staging 中写出新的 FAISS 索引，以保证行 ID 与元数据对齐。
- Local embedding and reranker models are not bundled in the first release.
- 首版不内置本地 embedding 和 reranker 模型。
- Retrieval returns evidence candidates; it does not prove that the collection is complete, current, correct, or internally consistent.
- 检索返回的是证据候选，不能证明资料集合完整、最新、正确或内部一致。

## Roadmap / 路线图

- First-class PDF extraction/OCR adapters with coverage reports
- 带覆盖报告的 PDF 提取/OCR adapter
- Local embedding and reranking providers
- 本地 embedding 与 reranking provider
- Additional source filters and collection namespaces
- 更多来源过滤条件和 collection namespace
- Evaluation fixtures for retrieval quality and citation coverage
- 用于检索质量和引用覆盖率的评估 fixtures
- Publish the validated npm package and a separate Python engine package
- 发布经过验证的 npm package 与独立 Python engine package

## Development / 开发

### Source checkout / 源码 checkout

Use this workflow only when developing Chilon Recall or when you need a source-based configuration instead of the npm installer:

仅在开发 Chilon Recall，或需要源码配置而非 npm installer 时使用以下流程：

```bash
git clone https://github.com/ctrlcakepro/chilon-recall.git
cd chilon-recall
npm install
python -m venv .venv
```

Activate the virtual environment, then install the Python engine:

激活 virtual environment 后安装 Python engine：

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

```bash
npm install
python -m pip install -e .
npm run check
```

Tests use synthetic documents and mock provider endpoints, so they do not need a paid API key. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

测试使用合成资料与 mock provider endpoint，因此不需要付费 API key。参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

## License / 许可证

[MIT](LICENSE) © 2026 ctrlcakepro and contributors.

项目使用 [MIT](LICENSE) 许可证，© 2026 ctrlcakepro and contributors。
