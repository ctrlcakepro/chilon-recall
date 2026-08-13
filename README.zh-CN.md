# Chilon Recall

**面向学习与严肃知识工作的本地优先知识检索引擎。**

[English](README.md) · [安全策略](SECURITY.md) · [参与贡献](CONTRIBUTING.md)

Chilon Recall 可将你自己的文本资料转换为私有、来源可追溯的知识库，并通过本地 MCP 提供给 Codex、Claude Desktop 等客户端。你可以询问资料内容、比较概念、制作复习提纲，或从长期笔记中找回某项论据，同时保留来源路径、证据边界和索引操作记录。

它是 [Chilon Knowledge Work Harness](https://github.com/ctrlcakepro/chilon-knowledge-work-harness) 品牌下的独立检索产品。两个项目保持分离：Chilon Recall 负责本地检索，原 harness 可以继续编排更广泛的长期知识工作。

## 为什么使用 Chilon Recall？

- **基于资料学习**：先回答“你选择的资料说了什么”，避免把模型印象当成来源事实。
- **答案可追溯**：每条结果包含相对路径、标题层级、近似行号和检索分数。
- **本地优先控制**：文档和 FAISS 索引留在本机；只有发送给自选 embedding/reranker 服务的文本会离开设备。
- **安全索引操作**：新索引先在 staging 完成；清理和恢复需要预览、短期确认 token，并保留可恢复备份。
- **跨 MCP 客户端**：同一 `stdio` MCP server 可用于 Codex、Claude Desktop 及其他兼容客户端。

## 面向学习与知识工作的能力

| 需求 | 工具 | 返回内容 |
| --- | --- | --- |
| 从笔记或报告找回论据 | `rag_query` | 带来源元数据的排序片段 |
| 基于课程或参考资料回答问题 | `textbook_qa` | 直接回答所需的证据包 |
| 区分两个概念或方法 | `concept_compare` | 适合比较表的证据 |
| 把章节整理成结构化笔记 | `chapter_summary` | 章节总结证据与覆盖提醒 |
| 复习或备考 | `review_outline` | 概念、联系、易混点和练习题 |

仓库中的示例资料完全为合成内容，不包含真实教材、个人笔记或私有索引。

## 五分钟快速开始

### 1. 安装运行环境

需要 Node.js 20+ 与 Python 3.10+：

```bash
git clone https://github.com/ctrlcakepro/chilon-recall.git
cd chilon-recall
npm install
python -m venv .venv
```

激活虚拟环境：

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS 或 Linux
source .venv/bin/activate
```

安装 Python 引擎：

```bash
python -m pip install -e .
```

### 2. 创建私有配置

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

### 3. 启动 MCP server

```bash
npm start
```

服务器使用 `stdio`，通常由 MCP 客户端启动，而不是作为交互式命令行程序独立使用。连接后先调用 `rag_status`，再预览 `rag_build`，最后携带返回的确认 token 执行建库。

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

仓库也包含合法的 Codex plugin 结构：`.codex-plugin/plugin.json`、`.mcp.json` 和四个学习 skills。在发布 registry package 之前，从源码 clone 后直接配置 MCP 是最清楚可靠的安装方式。

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

应在 Claude Desktop 能继承的系统环境中设置 `RAG_API_KEY`；若操作系统无法提供，只能把它加入你本机的私有客户端配置。Claude Desktop 会把 `env` 值保存在本地 JSON 中，因此请限制文件权限，且绝不能提交该配置。Windows 用户应指向虚拟环境中的 `python.exe`。

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
- `rag_build`、`rag_clear_index`、`rag_restore_index` 必须先使用 `action: "preview"`。预览会返回与当前配置、来源和索引状态绑定的短期 token，再用 `action: "execute"` 执行一次。

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

- v0.1.0 只索引 UTF-8 `.md`、`.txt`、`.rst`、`.csv`。PDF 应先转换为经过核对的文本，扫描版需 OCR。
- 分块器识别 Markdown `#` 与 `##` 标题，尚未语义解析表格、引文或原生文档结构。
- 当前为全量重建，不支持增量索引。
- 首版不内置本地 embedding/reranker 模型。
- 检索结果只是证据候选，不能证明资料集合完整、最新、正确或内部一致。

## 路线图

- 基于内容哈希的增量索引
- 带覆盖报告的 PDF 提取/OCR adapter
- 本地 embedding 与 reranking provider
- 来源过滤和 collection namespace
- 检索质量及引用覆盖 eval fixtures
- 源码安装稳定后发布 npm/PyPI package

## 开发与许可

```bash
npm install
python -m pip install -e .
npm run check
```

测试只使用合成资料与 mock provider，不需要付费 API key。项目使用 [MIT License](LICENSE)。
