# Agent 安装流程 — Chilon Recall

这份文件是写给 AI coding agent（Claude Code、Codex CLI、Cursor 等）看的执行说明，不是人类用的说明书。如果你是人类，请看 [README.zh-CN.md](README.zh-CN.md)，或者直接把下面这段话复制给你的 agent。

## 给人类的一句话提示词

把路径填好后复制给你的 agent：

> 请读取 https://raw.githubusercontent.com/ctrlcakepro/chilon-recall/main/AGENTS_INSTALL.zh-CN.md，照着帮我安装配置 chilon-recall。我的文档目录是：`<路径>`。我用的 MCP 客户端是：`<Claude Desktop / Codex / Qoder / DeepSeek Harness / 还不确定>`。

---

## 给 agent 的执行说明

你正在为一个不一定懂技术的用户安装 [chilon-recall](https://github.com/ctrlcakepro/chilon-recall)，一个本地 MCP 知识检索 server。下面所有步骤都可以自动完成，**唯独第 4 步（API key）不行**——这一步要交还给人类自己做，原因写在那一节里，不是泛泛的谨慎，而是这个项目代码和更新日志里写明的具体理由。不要因为它看起来更慢就绕过去。

以下命令里固定使用的版本号：`0.1.5`。这是本文件编写时 `package.json` 里的版本；执行前先看一眼 `CHANGELOG.md` 或 npm，确认有没有更新的版本，如果有就用新的。

### 0. 前置检查

运行 `node -v` 和 `python --version`（或 `python3 --version`）。需要 Node.js ≥ 20、Python ≥ 3.10。缺哪个就停下来告诉用户自己装——不要没问过用户就擅自帮他们装语言运行时。

### 1. 收集两项不敏感的信息

问用户（如果对方第一条消息里已经给了就跳过）：

- 想要建索引的文档文件夹的绝对路径
- 打算连接哪个 MCP 客户端（Codex / Claude Desktop / Qoder / DeepSeek Harness）——第 6 步要用
- 他们 embedding provider 的 API base URL（例如 `https://api.siliconflow.cn/v1`）——这是一个接口地址，不是密钥

### 2. 安装

```powershell
npx -y chilon-recall@0.1.5 install "<文档目录路径>"
```

会在 `<文档目录路径>\chilon-recall.json` 写入配置，并装好受管 Python engine。这一步完全不涉及凭据。如果这一步失败了，把真实报错展示给用户，不要盲目重试——路径太深太长、Python 版本不到 3.10、权限问题是常见原因，没有一个万能修复可以自动尝试。

### 3. 把配置指向真实 provider，并持久化 `RAG_MANAGER_CONFIG`（仍然不涉及密钥）

`install` 自己打印的 JSON 结果里有 `"config": "<文档目录路径>\\chilon-recall.json"`——这是后面所有步骤都要用到的路径。`RAG_MANAGER_CONFIG` 没有默认值：`doctor`、`key`、MCP server 只要读不到它就会直接报错（见 `src/config.mjs` 里的 `resolveConfigPath()`）。它不是密钥，所以和 API key 不一样，这一步你自己就能设置并持久化：

```powershell
$env:RAG_MANAGER_CONFIG = "<文档目录路径>\chilon-recall.json"   # 当前会话，供下面 doctor/key 调用使用
setx RAG_MANAGER_CONFIG "<文档目录路径>\chilon-recall.json"     # 长期生效——第 5、6 步会用到
```

（bash/zsh：当前会话用 `export RAG_MANAGER_CONFIG="<路径>"`，再把同一行追加进 `~/.bashrc` / `~/.zshrc` 做持久化。）

然后编辑 `<文档目录路径>\chilon-recall.json`，把 `embedding.base_url` 改成第 1 步拿到的地址。`embedding.model` 先留着占位值不动——第 4 步会给你一个真实的模型名。

### 4. 把 API key 这一步交还给人类——不要自动化它

这是整个流程里唯一不该帮用户做、也不该让用户直接把 key 粘进这个对话里的一步。两个具体理由，都来自这个项目自己的代码和更新日志，不是套话：

- `chilon-recall key` 的隐藏输入提示，设计目的就是让 key 除了用户自己的终端之外不经过任何中间层。这个项目 0.1.4 的更新日志写的是 key "is used for a single request and is never written to disk"——这个承诺只有在 key 也不进入*你*（agent）的上下文和工具调用日志时才成立。
- 如果你自己拼出命令、通过你自己的 shell 工具去跑，key 就会以明文形式留在你的工具调用记录里。这和"专门为一个人在一个终端上输入"设计的隐藏输入提示，暴露程度完全不是一回事。

所以：告诉用户自己打开一个**他们自己控制的**终端窗口（不是你在操作的那个），运行：

```powershell
npx -y chilon-recall@0.1.5 key --base-url "<第1步拿到的base-url>"
```

请他们：

1. 按提示把 key 作为单行粘贴。（剪贴板里如果混进了换行，输入会在第一个换行处就被截断——如果他们复制的是整段 `KEY=...` 配置而不是纯 key 本身，提醒他们只复制 key 部分。）
2. 记下它打印出的推荐 embedding 模型名——这部分不是密钥，可以直接告诉你。
3. 自己运行打印出来的其中**一条**命令：选"persists for new windows/shells"（长期生效）那一条——Windows 上是 `setx`，bash/zsh 上是追加到 `~/.bashrc` / `~/.zshrc` 的那一行——不要选"this window only"（仅当前窗口）的那条。要用长期生效的形式，因为第 5 步你要从另一个进程里检查它是否生效。
4. 回来告诉你模型名，并确认已完成。

不要让他们把 key 本身粘给你。如果对方还是粘过来了，不要把它写进任何地方、也不要用它跑任何命令——直接告诉对方这个值现在已经暴露在这段对话记录里了，建议去 provider 那边把它作废重新生成，并请他们自己运行设置环境变量的命令。

拿到模型名之后，把它写进 `chilon-recall.json` 的 `embedding.model`。

### 5. 验证凭据——必须用一个全新的进程

长期生效的环境变量只对"设置之后才启动"的进程生效。用一个第 4 步之后才新开的 shell（不是你之前一直在用的那个）运行：

```powershell
npx -y chilon-recall@0.1.5 doctor
```

它会打印一份 JSON 报告，退出码也是 `bootstrap_python.ready && engine.ready && configuration.ready && configuration.credentials_ready` 的结果（0/1）。要读 JSON 里的字段，不要只看退出码：

- `configuration.credentials_ready: true` → 完成，进入第 6 步。
- `configuration.error` 里提到 `RAG_MANAGER_CONFIG is required` → 说明它没被持久化，或者这个进程是在第 3 步的 `setx`/profile 生效之前就启动的。重新设置一次（当前会话级别就够用来通过这一项检查）再重试。
- `configuration.embedding_credential_available: false` → API key 的变量没有传到这个进程里。不要默默重试，直接告诉用户：你现在这个 shell/会话大概率需要重启一下才能读到 `setx` 或 profile 文件里新写入的变量，请他们重启后再让你检查。
- `configuration.ready: false` 且报的是占位值错误 → 说明第 4 步 `embedding.model` 其实没改成功，修好再试。

### 6. 配置 MCP 客户端

这一部分可以完全自动化——下面给的都是准确的格式。写进任何文件时都只引用环境变量的*名字*，不要写值。

**Qoder** —有专门的生成器，直接用它，不要手动改文件：

```powershell
npx -y chilon-recall@0.1.5 qoder "<项目目录>"
```

**Codex**（`~/.codex/config.toml`）——合并进去，不要覆盖已有的其他 `[mcp_servers.*]` 条目：

```toml
[mcp_servers.chilon-recall]
command = "npx"
args = ["-y", "chilon-recall@0.1.5", "mcp"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

`env_vars` 只是把这些名字从 Codex 自己启动时继承到的环境变量里转发过去——它本身不设置值。这正是第 3 步要持久化 `RAG_MANAGER_CONFIG`、第 4 步要持久化 `RAG_API_KEY` 的原因：不这么做，Codex 就没有东西可转发。

如果在 Windows 上客户端起不来 `npx`（它是个 `.cmd` shim，有些客户端直接 spawn 进程、不经过 shell 时解析不了），退回用 `npm install -g chilon-recall@0.1.5` 全局安装，把 `command` 指向 `node` 加安装后脚本的绝对路径，或者直接指向全局的 `chilon-recall` shim。

**Claude Desktop**（`claude_desktop_config.json`——Windows: `%APPDATA%\Claude\claude_desktop_config.json`；macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）——合并进 `mcpServers`，不要覆盖其他条目：

```json
"chilon-recall": {
  "command": "npx",
  "args": ["-y", "chilon-recall@0.1.5", "mcp"],
  "env": {
    "RAG_MANAGER_CONFIG": "<文档目录路径>\\chilon-recall.json"
  }
}
```

把 `RAG_MANAGER_CONFIG` 直接写进这个文件——它是路径，不是密钥，这样写还能绕开"Claude Desktop 的进程到底有没有继承到 `setx` 设置的值"这个不确定因素（GUI 程序往往要完整注销登录才能读到新值，光重启程序不够）。`RAG_API_KEY` 不一样：不要写进这个文件，靠 Claude Desktop 自己继承到的环境变量传递。如果用户告诉你这不生效，README 里给出的退路是在同一个 `"env"` 块里也加上它——但这会让 key 以明文形式存在本地文件里。只在用户明确要求、并且当场为这个用途粘贴一次 key 的情况下才这么做，并提醒他们限制文件权限、绝不要把它提交进版本库。

**DeepSeek Harness** —— 用 [README.zh-CN.md](README.zh-CN.md#deepseek-harness) 里的 `dsh --patch` / `dsh plugin add` 命令；"绝不经手真实 key"这条规则同样适用。

### 7. 重启并交接

别人的 GUI 客户端你没法替他们重启。请用户自己重启/重新加载配置好的那个客户端，然后建议做个冒烟测试——在客户端里调用一次 `rag_status`。

### 8. 向用户汇报

告诉用户你自动做了什么、他们手动做了什么（key 这一步），并明确说明你自始至终没有看到过真实的 key 值。

---

## 硬性规则

以下规则优先于上面任何一步里的"图省事"做法：

- 不要让用户把 API key 粘进这个对话。
- 不要自己拼出、或运行任何包含 key 值的命令。
- 不要把明文 key 写进任何文件，除非用户当场明确要求走这条退路。
- 如果 key 还是不小心暴露在了对话里，直接说清楚，建议去作废重新生成——不要装作什么都没发生地继续往下走。
