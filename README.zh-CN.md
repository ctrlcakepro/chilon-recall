# Chilon Recall

**面向学习与严肃知识工作的本地优先知识检索引擎。**

**文档语言：** [English](README.md) · **简体中文（当前页面）**

[安全策略](SECURITY.md) · [参与贡献](CONTRIBUTING.md)

Chilon Recall 可将你自己的文本资料转换为私有、来源可追溯的知识库，并通过本地 MCP 提供给 Codex、Claude Desktop 等客户端。你可以询问资料内容、比较概念、制作复习提纲，或从长期笔记中找回某项论据，同时保留来源路径、证据边界和索引操作记录。

它是 [Chilon Knowledge Work Harness](https://github.com/ctrlcakepro/chilon-knowledge-work-harness) 品牌下的独立检索产品。两个项目保持分离：Chilon Recall 负责本地检索，原 harness 可以继续编排更广泛的长期知识工作。

## 新手先看

第一次接触 MCP？你只需要一个资料文件夹、Node.js 20+ 和 Python 3.10+。先完成下面三步；客户端配置和技术细节在后文。

1. **安装到资料文件夹。** 运行一次下面的命令。它会创建私有配置与受管 Python engine；不会把 API key 写入 package 或配置文件。

   ```powershell
   npx -y chilon-recall@0.1.3 install C:\path\to\your\documents
   ```

2. **设置 provider key。** 打开生成的 `chilon-recall.json`，选择 provider endpoint 与 model，再只在环境变量中设置密钥。运行 `doctor` 确认环境可用。

   ```powershell
   $env:RAG_MANAGER_CONFIG = "C:\path\to\your\documents\chilon-recall.json"
   $env:RAG_API_KEY = "your-provider-key"
   npx -y chilon-recall@0.1.3 doctor
   ```

3. **连接一个客户端。** 从 [Codex](#codex)、[Claude Desktop](#claude-desktop) 或 [Qoder](#qoder) 开始即可。客户端会替你启动本地 server，无需另开终端长期运行。

## 为什么使用 Chilon Recall？

- **基于资料学习**：先回答“你选择的资料说了什么”，避免把模型印象当成来源事实。
- **答案可追溯**：每条结果包含相对路径、标题层级、近似行号和检索分数。
- **本地优先控制**：文档和 FAISS 索引留在本机；只有发送给自选 embedding/reranker 服务的文本会离开设备。
- **安全索引操作**：新索引先在 staging 完成；清理和恢复需要预览、短期确认 token，并保留可恢复备份。
- **跨 MCP 客户端**：同一 `stdio` MCP server 可用于 Codex、Claude Desktop、Qoder 及其他兼容客户端。

## 面向学习与知识工作的能力

| 需求 | 工具 | 返回内容 |
| --- | --- | --- |
| 从笔记或报告找回论据 | `rag_query` | 带来源元数据的排序片段 |
| 基于课程或参考资料回答问题 | `textbook_qa` | 直接回答所需的证据包 |
| 区分两个概念或方法 | `concept_compare` | 适合比较表的证据 |
| 把章节整理成结构化笔记 | `chapter_summary` | 章节总结证据与覆盖提醒 |
| 复习或备考 | `review_outline` | 概念、联系、易混点和练习题 |
| 资料变更后刷新索引 | `rag_sync` | 新增、修改、删除、未变更的文件数，以及复用与重新嵌入的向量数 |

仓库中的示例资料完全为合成内容，不包含真实教材、个人笔记或私有索引。

## 详细安装与配置

### 1. 使用 npm 安装

需要 Node.js 20+ 与 Python 3.10+。npm CLI 会创建独立 Python virtual environment，不会把凭据写入 package 或配置文件。

使用已发布且固定版本的 npm package，只需一条命令即可创建私有配置并安装独立 Python engine：

```powershell
npx -y chilon-recall@0.1.3 install C:\path\to\your\documents
```

托管 engine 保存在临时 npx cache 之外。可用 CHILON_RECALL_HOME 指定其他持久位置；升级 package 后再次运行 `setup`。

该命令会在资料目录写入 `chilon-recall.json`，并在操作系统用户数据目录（或 CHILON_RECALL_HOME）创建持久的受管 Python engine。这些文件是本地运行所必需的；凭据不会写入其中。

安装过程不会把凭据写入 package 或配置文件。要执行查询或建库，请在安装完成后由你自己在环境变量中设置 provider key。

设置 RAG_MANAGER_CONFIG 与 provider 凭据后，可运行 doctor 检查运行环境和私有配置：

```powershell
$env:RAG_MANAGER_CONFIG = "C:\path\to\your\documents\chilon-recall.json"
$env:RAG_API_KEY = "your-provider-key"
npx -y chilon-recall@0.1.3 doctor
```

如果你通过 npm 安装，现在可以直接前往 [连接 MCP 客户端](#连接-mcp-客户端)。以下内容面向源码 checkout 或需要自定义配置的用户。

### 2. 手动私有配置

通过 npm 安装时，init 已在资料目录写入 chilon-recall.json，并将 project_dir 设为 .、rag_dir 设为 ./.chilon-recall。编辑其中的 provider 字段即可；不要把 API key 写入 JSON。

把 `config/chilon-recall.example.json` 复制为 `config/chilon-recall.json`。目标文件已被 Git 忽略。

将 `project_dir` 指向资料目录，将 `rag_dir` 指向其内部的专用子目录。API key 不得写入 JSON：

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

仓库提供 `config/siliconflow.example.json` 作为示例，但项目并不绑定 SiliconFlow。Embedding 使用 OpenAI-compatible `/embeddings` endpoint，reranker 使用 Cohere-compatible endpoint；没有 reranker 时可将其禁用。

### 3. 启动源码 checkout 的 MCP server

```bash
npm start
```

服务器使用 `stdio`，通常由 MCP 客户端启动，而不是作为交互式命令行程序独立使用。连接后先调用 `rag_status`，再预览 `rag_build`，最后携带返回的确认 token 执行建库。资料变更后请使用 `rag_sync` 刷新，而不是重新建库；未变更文件会复用已有向量。

## 连接 MCP 客户端

客户端配置应使用绝对路径，避免依赖不确定的启动目录。

### Codex

当前 Codex 本地客户端支持 `stdio MCP` 并共享同一份 `config.toml`。可通过 ChatGPT 桌面端的 **Settings → MCP servers**、`codex mcp add` 或 `~/.codex/config.toml` 添加：

```toml
[mcp_servers.chilon-recall]
command = "node"
args = ["/absolute/path/to/chilon-recall/scripts/server.mjs"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY", "CHILON_RECALL_PYTHON"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

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

仓库也包含合法的 Codex plugin 结构：`.codex-plugin/plugin.json`、`.mcp.json` 和四个学习 skills。源码 clone 时请使用上方直接 node 配置，并将 CHILON_RECALL_PYTHON 指向对应 virtual environment。

### DeepSeek Harness

仓库同时提供 DeepSeek Harness bundle。它使用 DSH 官方的 `@deepseek-ai/dsh-mcp-client` bridge，因此现有 MCP 工具会以 `mcp__chilon-recall__rag_status` 等稳定名称暴露给 DSH；不会重复运行检索引擎，也不会把凭据作为 tool 参数传给模型。

源码 checkout 时，设置绝对项目路径和同一份私有配置。一次性运行时无需安装 bundle，直接使用 overlay：

当前 DSH 限制：bundle 只转发 RAG_MANAGER_CONFIG、RAG_API_KEY、RAG_RERANK_API_KEY、CHILON_RECALL_HOME 和 CHILON_RECALL_PYTHON。在支持任意 `api_key_env` 转发之前，使用 DSH 时请采用标准 RAG 密钥环境变量名。

```powershell
$env:CHILON_RECALL_ROOT = (Resolve-Path .).Path
$env:RAG_MANAGER_CONFIG = (Resolve-Path .\config\chilon-recall.json).Path
$env:RAG_API_KEY = "your-provider-key"
dsh --profile web --patch .\dsh\cordis.patch.yml
```

如果要持久安装到 DSH profile，请先安装一次仓库 bundle，再启动 profile。Windows 当前 DSH/pnpm 的路径转发可能拆分含空格的源码路径，必要时请使用 8.3 短路径：

```powershell
$bundlePathForDsh = (cmd /c "for %I in (.) do @echo %~sI").Trim()
dsh plugin --profile web add $bundlePathForDsh
dsh --profile web
```

bundle 会在 `CHILON_RECALL_ROOT` 中运行 `node scripts/cli.mjs mcp`。如果私有配置需要，可继续设置 `RAG_RERANK_API_KEY`、`CHILON_RECALL_HOME` 或 `CHILON_RECALL_PYTHON`。DSH 仍属于 developer preview，其 bundle 或 plugin API 可能独立于 Chilon Recall 发生变化。

### Claude Desktop

将以下配置加入 `claude_desktop_config.json`，并替换所有示例路径：

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

对于 npm 已发布版本，请把 command 和 args 替换为以下内容，并省略 CHILON_RECALL_PYTHON；它由 setup 管理：

```json
"command": "npx",
"args": ["-y", "chilon-recall@0.1.3", "mcp"]
```

应在 Claude Desktop 能继承的系统环境中设置 `RAG_API_KEY`；若操作系统无法提供，只能把它加入你本机的私有客户端配置。Claude Desktop 会把 `env` 值保存在本地 JSON 中，因此请限制文件权限，且绝不能提交该配置。Windows 用户应指向虚拟环境中的 `python.exe`。

### Qoder

Qoder IDE 从自身设置中加载 MCP server，并从项目内的 `.qoder/` 目录加载项目级 skills 与 rules。可用一条命令生成这三部分：

```powershell
npx -y chilon-recall@0.1.3 qoder C:\path\to\your\project
```

该命令会写入 `.qoder/mcp.json`、每个内置 skill 对应的 `.qoder/skills/<name>/SKILL.md`，以及 `.qoder/rules/chilon-recall.md`。若要覆盖已有文件，请加 `--force`。

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

请在 Qoder 可继承的系统环境中设置 `RAG_API_KEY`（启用 reranking 时还需 `RAG_RERANK_API_KEY`）。生成的文件可以提交到版本库，其中绝不应写入凭据。重启 Qoder IDE 以加载生成的 skills 与 rules，并在 **My Servers** 中确认工具已出现。

## 工作原理

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

Node.js MCP host 负责配置验证、资料发现、确认 token、路径安全、备份和面向客户端的工具。Python 引擎负责分块、provider 调用、FAISS 序列化与检索。索引通过 Python 字节 I/O 读写，以兼容 Windows 非 ASCII 路径。

## 工具一览

只读工具：

- `rag_status`
- `rag_list_documents`
- `rag_query`
- `rag_list_backups`
- `textbook_qa`
- `concept_compare`
- `chapter_summary`
- `review_outline`

配置和索引工具：

- `rag_save_config` 仅修改 schema 允许的非敏感字段，并备份原 JSON。
- `rag_build`、`rag_sync`、`rag_clear_index`、`rag_restore_index` 必须先使用 `action: "preview"`。预览会返回与当前配置、来源和索引状态绑定的短期 token，再用 `action: "execute"` 执行一次。`rag_sync` 通过文件哈希复用兼容的未变更向量，并同步新增、修改和删除；索引设置变化或旧 manifest 缺少必需哈希时会自动回退到全量重建。

## Provider 配置

首版 embedding 支持 `openai-compatible` adapter，需要配置 `base_url`、`model`、`api_key_env`，也可配置 `doc_prefix` 与 `query_prefix`。密钥只能存在于指定环境变量中。

`cohere-compatible` reranker 会向配置的 URL 发送 `model`、`query`、`documents`、`top_n` 和 `return_documents`。将 `enabled` 设为 `false` 可直接返回 FAISS 排名结果。

“兼容接口”并不保证所有 provider 行为完全相同。索引私有资料或产生大量费用前，应先用合成示例验证自选模型。

## 数据安全

- 服务器固定绑定一个 `RAG_MANAGER_CONFIG`；工具调用不能另选任意配置文件。
- Python 配置加载器会拒绝 secret-shaped 字段；provider 凭据只读环境变量。
- 默认隐藏绝对来源路径。
- active index、staging 与 backups 必须解析到 `rag_dir` 内部；根目录和越界路径会被拒绝。
- 新索引所有必要文件生成成功后才会替换 active index。
- 清理操作只把 active index 移入 `backups/`；恢复前也会先备份当前索引。
- 确认 token 十分钟后过期，只能使用一次；来源、配置或索引状态变化也会使其失效。

发布修改前运行：

```bash
npm run check
npm audit --audit-level=high
```

发布检查会拒绝疑似密钥、个人邮箱和用户目录绝对路径。

## 已知限制

- v0.1.3 只索引 UTF-8 `.md`、`.txt`、`.rst`、`.csv`。PDF 应先转换为经过核对的文本，扫描版需 OCR。
- 分块器识别 Markdown `#` 与 `##` 标题，尚未语义解析表格、引文或原生文档结构。
- `rag_build` 保留为全量重建入口；`rag_sync` 使用内容哈希做增量同步，并在 staging 中重建 FAISS，以保持行 ID 与元数据严格对齐。
- 首版不内置本地 embedding/reranker 模型。
- 检索结果只是证据候选，不能证明资料集合完整、最新、正确或内部一致。

## 路线图

- 带覆盖报告的 PDF 提取/OCR adapter
- 本地 embedding 与 reranking provider
- 来源过滤和 collection namespace
- 检索质量及引用覆盖 eval fixtures
- 发布经过验证的 npm package 与独立 Python engine package

## 开发与许可

### 源码 checkout

仅在开发 Chilon Recall，或需要源码配置而非 npm installer 时使用以下流程：

```bash
git clone https://github.com/ctrlcakepro/chilon-recall.git
cd chilon-recall
npm install
python -m venv .venv
```

激活 virtual environment 后安装 Python engine：

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

```bash
# macOS 或 Linux
source .venv/bin/activate
python -m pip install -e .
```

```bash
npm install
python -m pip install -e .
npm run check
```

测试只使用合成资料与 mock provider，不需要付费 API key。项目使用 [MIT License](LICENSE)。
