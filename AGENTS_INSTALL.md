# Agent install runbook — Chilon Recall

This file is instructions for an AI coding agent (Claude Code, Codex CLI, Cursor, or similar), not end-user documentation. If you're a human, see [README.md](README.md) instead — or just copy the block below to your agent.

## One-liner for humans

Paste this to your agent, filling in your document folder path:

> Read https://raw.githubusercontent.com/ctrlcakepro/chilon-recall/main/AGENTS_INSTALL.md and follow it to install and configure chilon-recall for me. My document folder is: `<PATH>`. The MCP client I use is: `<Claude Desktop / Codex / Qoder / DeepSeek Harness / not sure>`.

---

## Instructions for the agent

You're installing [chilon-recall](https://github.com/ctrlcakepro/chilon-recall), a local MCP knowledge-retrieval server, for someone who may not be technical. Everything here is safe to automate **except step 4 (the API key)** — that one step you hand back to the human, and the reasons are explained inline rather than asserted. Don't shortcut it because it seems slower.

Pinned version used in the commands below: `0.1.5`. That matches this repo's `package.json` as of when this file was written — check `CHANGELOG.md` or npm before assuming it's still current, and use the newer version if one has shipped since.

### 0. Preconditions

Run `node -v` and `python --version` (or `python3 --version`). You need Node.js ≥ 20 and Python ≥ 3.10. If either is missing, stop and tell the user to install it themselves — don't install a language runtime on their behalf without asking first.

### 1. Collect two non-secret inputs

Ask the user for whatever they didn't already give you:

- the absolute path to the folder of documents they want indexed
- which MCP client they'll connect (Codex / Claude Desktop / Qoder / DeepSeek Harness) — needed in step 6
- their embedding provider's API base URL (e.g. `https://api.siliconflow.cn/v1`) — this is an endpoint, not a secret

### 2. Install

```powershell
npx -y chilon-recall@0.1.5 install "<documents-path>"
```

This writes `<documents-path>\chilon-recall.json` and sets up a managed Python engine. No credentials are touched by this step. If it fails, show the user the actual error rather than retrying blindly — long/nested install paths, a missing Python 3.10+, and permission issues are the common causes, and there's no single fix to attempt automatically.

### 3. Point the config at the real provider, and persist `RAG_MANAGER_CONFIG` (still no secrets)

`install`'s own JSON output includes `"config": "<documents-path>\\chilon-recall.json"` — that's the path everything downstream needs. `RAG_MANAGER_CONFIG` has no default: `doctor`, `key`, and the MCP server all throw immediately if it isn't set (`resolveConfigPath()` in `src/config.mjs`). It isn't a secret, so unlike the API key, you set and persist it yourself, right now:

```powershell
$env:RAG_MANAGER_CONFIG = "<documents-path>\chilon-recall.json"   # this session, for the doctor/key calls below
setx RAG_MANAGER_CONFIG "<documents-path>\chilon-recall.json"     # persists for new processes — you'll need this in step 5 and 6
```

(bash/zsh: `export RAG_MANAGER_CONFIG="<path>"` for the session, plus append the same line to `~/.bashrc`/`~/.zshrc` to persist it.)

Then edit `<documents-path>\chilon-recall.json` and set `embedding.base_url` to the URL from step 1. Leave `embedding.model` on its placeholder for now — you'll fill in the real value after step 4 gives you a model name.

### 4. Hand the API key step back to the human — do not automate this

This is the one part of the flow to not do for the user, and not to ask them to paste into this chat either. Two concrete reasons, both grounded in this project's own code and changelog rather than generic caution:

- `chilon-recall key`'s hidden-input prompt exists specifically so the key never has to pass through anything but the user's own terminal. This project's 0.1.4 changelog states the key "is used for a single request and is never written to disk" — that guarantee only holds if the key also stays out of *your* context and tool-call logs.
- If you built the command yourself and ran it through your own shell tool, the key would sit in your transcript in plaintext. That's a meaningfully different exposure than a single hidden terminal prompt designed for one human typing at one keyboard.

So: tell the user to open a terminal window **they** control (not one you're driving) and run:

```powershell
npx -y chilon-recall@0.1.5 key --base-url "<base-url-from-step-1>"
```

Ask them to:

1. Paste their key when prompted, as one line. (A clipboard that contains a newline gets truncated at the first one — if they copied a whole `KEY=...` block instead of just the value, warn them.)
2. Note the suggested embedding model name it prints — that part isn't secret, they can read it back to you.
3. Run **one** of the printed commands themselves: specifically the "persists for new windows/shells" variant (`setx` on Windows, or the `>> ~/.bashrc` / `>> ~/.zshrc` line on bash/zsh), not the "this window only" one. You need the persistent form because you'll check for it from a different process in step 5.
4. Come back, tell you the model name, and confirm they're done.

Never ask them to paste the key itself. If they paste it anyway, don't write it anywhere or run anything with it — tell them the value is now exposed in this conversation, ask them to rotate it with their provider, and have them run the env-setting command directly instead.

Once you have the model name, write it into `embedding.model` in `chilon-recall.json`.

### 5. Verify credentials — from a fresh process

A persistent env var only applies to processes started *after* it was set. Run `doctor` in a shell invocation that's new since step 4 (not one you already had open):

```powershell
npx -y chilon-recall@0.1.5 doctor
```

It prints a JSON report and also exits `0`/`1` for `bootstrap_python.ready && engine.ready && configuration.ready && configuration.credentials_ready`. Read the JSON, not just the exit code:

- `configuration.credentials_ready: true` → done, move to step 6.
- `configuration.error` mentioning `RAG_MANAGER_CONFIG is required` → it was never persisted, or this process started before step 3's `setx`/profile line took effect. Re-set it (session-scoped is enough to unblock this one check) and retry.
- `configuration.embedding_credential_available: false` → the API key variable didn't reach this process. Don't loop retrying silently — tell the user plainly that the shell/session you're running in probably needs to be restarted to pick up something set by `setx` or a profile file, and ask them to do that before you check again.
- `configuration.ready: false` with a placeholder-value error → `embedding.model` wasn't actually updated in step 4; fix it and retry.

### 6. Configure the MCP client

This part is fully automatable — the shapes below are exact. Reference environment variable *names* in every file you write, never values.

**Qoder** — has a generator; use it instead of hand-editing anything:

```powershell
npx -y chilon-recall@0.1.5 qoder "<project-dir>"
```

**Codex** (`~/.codex/config.toml`) — merge this block; don't overwrite other `[mcp_servers.*]` entries:

```toml
[mcp_servers.chilon-recall]
command = "npx"
args = ["-y", "chilon-recall@0.1.5", "mcp"]
env_vars = ["RAG_MANAGER_CONFIG", "RAG_API_KEY", "RAG_RERANK_API_KEY"]
startup_timeout_sec = 15
tool_timeout_sec = 1800
default_tools_approval_mode = "writes"
```

`env_vars` forwards those names from whatever environment Codex itself inherits when it starts — it doesn't set values. That's why step 3 persists `RAG_MANAGER_CONFIG` and step 4 persists `RAG_API_KEY`: without that, Codex has nothing to forward.

On Windows, if the client can't spawn `npx` (it's a `.cmd` shim some clients can't resolve when they spawn a process directly instead of through a shell), fall back to `npm install -g chilon-recall@0.1.5` and point `command` at `node` with the absolute installed script path, or at the global `chilon-recall` shim directly.

**Claude Desktop** (`claude_desktop_config.json` — Windows: `%APPDATA%\Claude\claude_desktop_config.json`; macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`) — merge into `mcpServers`, don't overwrite other entries:

```json
"chilon-recall": {
  "command": "npx",
  "args": ["-y", "chilon-recall@0.1.5", "mcp"],
  "env": {
    "RAG_MANAGER_CONFIG": "<documents-path>\\chilon-recall.json"
  }
}
```

Write `RAG_MANAGER_CONFIG` directly into this file — it's a path, not a secret, and doing so sidesteps whether Claude Desktop's process actually inherits whatever `setx` set (GUI apps often only pick that up after a full logoff, not just an app restart). `RAG_API_KEY` is different: leave it out of this file and rely on the environment Claude Desktop inherits. If the user tells you that isn't working, the documented fallback is adding it under this same `"env"` block — but that puts the raw key in a plaintext local file. Only do that on the user's explicit request, with a value they paste at that moment for that specific purpose, and remind them to restrict the file's permissions and never commit it.

**DeepSeek Harness** — use the `dsh --patch` / `dsh plugin add` commands from [README.md](README.md#deepseek-harness); the same never-touch-the-raw-key rule applies.

### 7. Restart and hand off

You can't restart someone else's GUI app for them. Tell the user to restart or reload whichever client they configured, then suggest a smoke test — asking that client to call `rag_status`.

### 8. Report back

Tell the user what you did automatically, what they did by hand (the key), and say explicitly that you never saw the raw key value.

---

## Hard rules

These override convenience at every step above:

- Never ask the user to paste their API key into this chat.
- Never construct or run a command that embeds the key value yourself.
- Never write a raw key into a file unless the user explicitly asks for that specific fallback, in that moment, for that reason.
- If a key ends up in this conversation anyway, say so plainly and suggest rotating it — don't quietly proceed as if nothing happened.
