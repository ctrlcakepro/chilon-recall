from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


class ConfigError(ValueError):
    """Raised when a Chilon Recall configuration is invalid."""


def _inside(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return child != parent
    except ValueError:
        return False


def load_config(config_path: str | Path) -> dict[str, Any]:
    path = Path(config_path).expanduser().resolve()
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if payload.get("version") != 1:
        raise ConfigError("Only configuration version 1 is supported.")

    def inspect(value: Any, trail: tuple[str, ...] = ()) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                normalized = str(key).lower().replace("-", "_")
                secret_shaped = re.search(r"(?:api_?key|secret|token|password)$", normalized)
                if secret_shaped and not normalized.endswith("_env"):
                    raise ConfigError(f"Secrets are not allowed in config files: {'.'.join((*trail, key))}")
                inspect(nested, (*trail, str(key)))
        elif isinstance(value, list):
            for index, nested in enumerate(value):
                inspect(nested, (*trail, str(index)))

    inspect(payload)
    project_dir = (path.parent / payload["project_dir"]).resolve()
    rag_dir = (path.parent / payload["rag_dir"]).resolve()
    if not _inside(rag_dir, project_dir):
        raise ConfigError("rag_dir must be a dedicated subdirectory inside project_dir.")

    embedding = payload.get("embedding", {})
    if embedding.get("adapter") != "openai-compatible":
        raise ConfigError("embedding.adapter must be openai-compatible.")
    reranker = payload.get("reranker", {})
    if reranker.get("enabled", True) and reranker.get("adapter") != "cohere-compatible":
        raise ConfigError("reranker.adapter must be cohere-compatible.")
    urls = [embedding.get("base_url"), reranker.get("url")]
    for url in (item for item in urls if item):
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConfigError("Provider URLs must be absolute HTTP(S) URLs.")
        if parsed.username or parsed.password:
            raise ConfigError("Provider URLs must not contain embedded credentials.")

    payload["_config_path"] = path
    payload["_project_dir"] = project_dir
    payload["_rag_dir"] = rag_dir
    payload["_index_dir"] = rag_dir / "faiss_db"
    return payload


def credential(config: dict[str, Any], provider: str) -> str:
    if provider == "embedding":
        env_name = config["embedding"]["api_key_env"]
    elif provider == "reranker":
        env_name = config["reranker"].get("api_key_env") or config["embedding"]["api_key_env"]
    else:
        raise ConfigError(f"Unknown provider: {provider}")
    value = os.environ.get(env_name)
    if not value:
        raise ConfigError(f"Required credential environment variable is not set: {env_name}")
    return value
